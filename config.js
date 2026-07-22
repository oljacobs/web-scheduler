window.APP_CONFIG = {
  supabaseUrl: "https://syhavwbxvlzpqqqxqaeg.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN5aGF2d2J4dmx6cHFxcXhxYWVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NjY0MDEsImV4cCI6MjA5MTQ0MjQwMX0.5OPIVB6WxNuKJxtfoHA_DhcaIZPHCGV73k1XunFGR8Q",

  // --- Django scheduler backend (live) ---
  // Set = use the Django API on Railway. Blank = fall back to Supabase.
  schedulerApiUrl: "https://checklist.d7fr.org",
  // Microsoft scope the API validates (from Entra "Expose an API").
  schedulerApiScopes: ["api://62546244-95aa-4a1f-8142-bcdc803e4ad8/access_as_user"],

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
