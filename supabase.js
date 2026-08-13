import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const SUPABASE_URL = 'https://kqjdqidwzegbtysarksa.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_d59enY6PUoyiMHne-U1bQQ_kDZZq7X7';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // Was hardcoded to false, which silently disabled Supabase from ever
    // reading the OAuth redirect URL (the code/token Google + Supabase
    // hand back after sign-in) - the whole Google/Supabase handshake was
    // completing correctly, the app just never looked at the result.
    // false was very likely intentional for native (there's no real
    // browser URL to parse there, and the native Google sign-in flow in
    // App.js already calls supabase.auth.setSession() manually with the
    // tokens it gets from expo-web-browser, so detection isn't needed on
    // that path either way). true is required on web for the redirect-back
    // flow to actually establish a session.
    detectSessionInUrl: Platform.OS === 'web'
  }
});
