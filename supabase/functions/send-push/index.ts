// supabase/functions/send-push/index.ts
//
// Sends the actual push notification for a new row in `notifications`
// (like, follow, create_password - see App.js's three insert sites, all of
// which funnel through this one table). This is the fix for push
// notifications being unreliable when the app is closed: previously,
// sendPushNotification() in App.js called Expo's push API directly from
// the ACTING user's own device, fire-and-forget, with no retry and no
// receipt check outside the admin test button. That made delivery
// dependent on the acting user's device happening to have connectivity and
// staying alive long enough to finish the request - nothing to do with the
// RECIPIENT's app being open or closed, but easy to misread as that.
//
// This function is triggered by a Supabase Database Webhook configured on
// `notifications` INSERT (Dashboard -> Database -> Webhooks - this file
// alone does nothing until that webhook exists and points at it). That
// means sending is driven by the row actually landing in Postgres,
// completely decoupled from any client's app/connectivity state - the
// reliability problem this was built to fix.
//
// Runs with the service role key, so it can read any user's push_token
// regardless of RLS - this is what allows locking push_token down to
// self-only reads for regular clients (see the RLS migration alongside
// this file) without breaking sending.
//
// SETUP:
// 1. supabase functions deploy send-push
// 2. Supabase Dashboard -> Edge Functions -> send-push -> confirm
//    SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are present (these are
//    auto-injected by Supabase for every Edge Function - nothing to add
//    manually for this specific pair).
// 3. Supabase Dashboard -> Database -> Webhooks -> Create a new webhook:
//    - Table: notifications
//    - Events: Insert
//    - Type: Supabase Edge Functions
//    - Edge Function: send-push
//    (This is the step that actually wires it up - the function alone is
//    inert without it.)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

// Same three message shapes App.js's client-side calls used to build
// directly - kept in sync here so notification wording doesn't change for
// the person receiving it, just where it's sent from.
function buildMessage(row, actorName, portfolioTitle) {
  switch (row.type) {
    case 'like':
      return { title: 'New Like', body: `${actorName || 'Someone'} liked "${portfolioTitle || 'your portfolio'}"` };
    case 'follow':
      return { title: 'New Follower', body: `${actorName || 'Someone'} started following you` };
    case 'create_password':
      return { title: 'Secure your account', body: "Add a password so you can still sign in if Google ever isn't available." };
    default:
      return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    // Supabase Database Webhooks POST { type, table, record, old_record,
    // schema } - `record` is the newly-inserted row itself.
    const row = payload && payload.record;
    if (!row || !row.recipient_id) {
      return new Response(JSON.stringify({ error: 'No notification row in payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: recipient, error: recipientError } = await adminClient
      .from('profiles')
      .select('push_token')
      .eq('id', row.recipient_id)
      .maybeSingle();

    if (recipientError) {
      return new Response(JSON.stringify({ error: recipientError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    if (!recipient || !recipient.push_token) {
      // Not an error - most users simply haven't granted notification
      // permission yet, or are on a build that can't receive push. Return
      // 200 so the webhook doesn't retry indefinitely for something that
      // will never change.
      return new Response(JSON.stringify({ skipped: true, reason: 'No push token for recipient.' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // actor_name/portfolio_title only fetched when the notification type
    // actually needs them - create_password has neither, no point paying
    // for two extra queries on every send.
    let actorName = null;
    let portfolioTitle = null;
    if (row.actor_id) {
      const { data: actor } = await adminClient.from('profiles').select('name').eq('id', row.actor_id).maybeSingle();
      actorName = actor && actor.name;
    }
    if (row.type === 'like' && row.portfolio_id) {
      const { data: portfolio } = await adminClient.from('portfolios').select('title').eq('id', row.portfolio_id).maybeSingle();
      portfolioTitle = portfolio && portfolio.title;
    }

    const message = buildMessage(row, actorName, portfolioTitle);
    if (!message) {
      // Unrecognized notification type - nothing to send, not a failure.
      return new Response(JSON.stringify({ skipped: true, reason: `Unhandled notification type: ${row.type}` }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const sendResponse = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        to: recipient.push_token,
        title: message.title,
        body: message.body,
        sound: 'default'
      })
    });

    const sendResult = await sendResponse.json();
    const ticket = sendResult && sendResult.data;
    if (ticket && ticket.status === 'error') {
      console.error('Expo push send returned an error:', JSON.stringify(ticket));
      return new Response(JSON.stringify({ error: ticket.message || ticket.details?.error || 'Expo push API rejected the request.' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Receipt-checked on EVERY send now (the client-side version only did
    // this for the admin test button) - a successful ticket only means
    // Expo accepted the request, not that APNs/FCM actually delivered it.
    // Real failures (missing FCM credentials, DeviceNotRegistered, an
    // uninstalled app) only show up here. Logged via console.error so
    // they're visible in Supabase's own Edge Function logs without
    // needing a separate table just to track delivery failures.
    if (ticket && ticket.id) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      try {
        const receiptResponse = await fetch('https://exp.host/--/api/v2/push/getReceipts', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Accept-encoding': 'gzip, deflate',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ ids: [ticket.id] })
        });
        const receiptResult = await receiptResponse.json();
        const receipt = receiptResult && receiptResult.data && receiptResult.data[ticket.id];
        if (receipt && receipt.status === 'error') {
          console.error('Expo push receipt returned an error:', JSON.stringify(receipt), 'notification row:', row.id);
          // DeviceNotRegistered means the token is stale (app uninstalled,
          // or reinstalled and got a new one) - clearing it now means the
          // next send skips straight to the "no token" path above instead
          // of hitting Expo again for a token that will never work.
          if (receipt.details && receipt.details.error === 'DeviceNotRegistered') {
            await adminClient.from('profiles').update({ push_token: null }).eq('id', row.recipient_id);
          }
        }
      } catch (receiptErr) {
        console.error('Push receipt check failed:', receiptErr.message, 'notification row:', row.id);
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (e) {
    console.error('send-push function error:', e.message);
    return new Response(JSON.stringify({ error: e.message || 'Unknown server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
