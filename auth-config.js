// Public browser configuration only. Never put a service_role, secret key,
// database password or SMTP password in this file.
window.NIJI_AUTH_CONFIG = Object.freeze({
  supabaseUrl: "",
  publishableKey: "",
  emailEnabled: true // Configure custom SMTP and OTP templates before launch.
});
