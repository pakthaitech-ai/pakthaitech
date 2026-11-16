import assert from "node:assert/strict";
import { handleAuthRoute, authorizeRequest } from "./src/auth-session.js";

const env = {
  OWNER_LOGIN_PASSWORD: "test-owner-password-only",
  STAFF_LOGIN_PASSWORD: "test-staff-password-only",
  SESSION_SIGNING_SECRET: "test-signing-secret-that-is-longer-than-32-chars"
};
const login = await handleAuthRoute(new Request("https://example.test/api/auth/login", {
  method: "POST", headers: {"content-type":"application/json"},
  body: JSON.stringify({role:"owner",password:env.OWNER_LOGIN_PASSWORD})
}), env);
assert.equal(login.status, 200, "owner login succeeds");
const cookie = login.headers.get("set-cookie");
assert.match(cookie, /HttpOnly/);
assert.match(cookie, /Secure/);
assert.match(cookie, /SameSite=Strict/);
const tokenCookie = cookie.split(";")[0];
const me = await handleAuthRoute(new Request("https://example.test/api/auth/me", {headers:{cookie:tokenCookie}}), env);
assert.equal((await me.json()).role, "owner", "session persists through signed cookie");
const noSession = await authorizeRequest(new Request("https://example.test/api/dashboard"), env);
assert.equal(noSession.status, 401, "unauthenticated dashboard API is blocked");
const publicIntake = await authorizeRequest(new Request("https://example.test/api/customer-requests", {method:"POST"}), env);
assert.equal(publicIntake.allowed, true, "public store customer intake remains open");
const staffLogin = await handleAuthRoute(new Request("https://example.test/api/auth/login", {
  method:"POST",headers:{"content-type":"application/json"},
  body:JSON.stringify({role:"staff",password:env.STAFF_LOGIN_PASSWORD})
}),env);
const staffCookie = staffLogin.headers.get("set-cookie").split(";")[0];
const staffWrite = await authorizeRequest(new Request("https://example.test/api/settings",{method:"POST",headers:{cookie:staffCookie}}),env);
assert.equal(staffWrite.status,403,"staff cannot write settings");
const ownerWrite = await authorizeRequest(new Request("https://example.test/api/settings",{method:"POST",headers:{cookie:tokenCookie}}),env);
assert.equal(ownerWrite.allowed,true,"owner may use protected write APIs");
const badLogin = await handleAuthRoute(new Request("https://example.test/api/auth/login", {
  method:"POST",headers:{"content-type":"application/json"},
  body:JSON.stringify({role:"owner",password:"wrong"})
}),env);
assert.equal(badLogin.status,401,"wrong password rejected");
console.log("AUTH_SESSION_TESTS_PASSED: owner login/session, unauthorized API block, public intake, staff read-only, owner write, wrong-password rejection");
