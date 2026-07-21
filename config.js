window.APP_CONFIG = {
  supabaseUrl: "https://syhavwbxvlzpqqqxqaeg.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN5aGF2d2J4dmx6cHFxcXhxYWVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NjY0MDEsImV4cCI6MjA5MTQ0MjQwMX0.5OPIVB6WxNuKJxtfoHA_DhcaIZPHCGV73k1XunFGR8Q",

  // --- New Django scheduler backend (replaces Supabase when set) ---
  // Leave BLANK to keep using Supabase (current live behavior, unchanged).
  // Local testing:  "http://127.0.0.1:8000"
  // Production later: "https://checklist.d7fr.org"
  schedulerApiUrl: "",
  // Microsoft scope the API expects, once "Expose an API" is set up in Entra.
  // e.g. ["api://<api-client-id>/access_as_user"]. Leave [] for dev-open testing.
  schedulerApiScopes: [],

  // Microsoft Entra ID — single sign-on and employee directory
  msalConfig: {
    auth: {
      clientId: "62546244-95aa-4a1f-8142-bcdc803e4ad8",
      authority: "https://login.microsoftonline.com/e4b2673e-ad76-4070-9714-2c77228780f2",
      redirectUri: window.location.origin,
    },
    cache: {
      cacheLocation: "sessionStorage",
      storeAuthStateInCookie: false,
    },
  },
};
