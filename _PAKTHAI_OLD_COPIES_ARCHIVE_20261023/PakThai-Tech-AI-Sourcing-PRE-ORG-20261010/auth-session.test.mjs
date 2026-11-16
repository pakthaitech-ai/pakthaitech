import assert from "node:assert/strict";
import { handleAuthRoute, authorizeRequest } from "./src/auth-session.js";

const env = {
  OWNER_LOGIN_PASSWORD: "test-owner-password-only",
  SESSION_SIGNING_SECRET: "test-signing-secret-that-is-longer-than-32-chars",
  DB: {
    async batch() { return []; },
    prepare(sql) {
      let args = [];
      const q = {
        bind(...values) { args = values; return q; },
        async run() { return {meta:{changes:0,last_row_id:0}}; },
        async all() { return {results:[]}; },
        async first() {
          if (sql.includes("FROM auth_owner_password")) return null;
          if (sql.includes("FROM auth_staff WHERE email")) return null;
          if (sql.includes("FROM auth_staff WHERE id")) return null;
          return null;
        }
      };
      return q;
    }
  }
};
const login = await handleAuthRoute(new Request("https://example.test/api/auth/login", {
  method:"POST",headers:{"content-type":"application/json"},
  body:JSON.stringify({role:"owner",password:env.OWNER_LOGIN_PASSWORD})
}),env);
assert.equal(login.status,200,"owner login succeeds");
const cookie = login.headers.get("set-cookie");
assert.match(cookie,/HttpOnly/);
assert.match(cookie,/Secure/);
assert.match(cookie,/SameSite=Strict/);
const tokenCookie = cookie.split(";")[0];
const me = await handleAuthRoute(new Request("https://example.test/api/auth/me",{headers:{cookie:tokenCookie}}),env);
assert.equal((await me.json()).role,"owner","session persists through signed cookie");
const noSession = await authorizeRequest(new Request("https://example.test/api/dashboard"),env);
assert.equal(noSession.status,401,"unauthenticated dashboard API is blocked");
const publicIntake = await authorizeRequest(new Request("https://example.test/api/customer-requests",{method:"POST"}),env);
assert.equal(publicIntake.allowed,true,"public store customer intake remains open");
const badLogin = await handleAuthRoute(new Request("https://example.test/api/auth/login",{
  method:"POST",headers:{"content-type":"application/json"},
  body:JSON.stringify({role:"owner",password:"wrong"})
}),env);
assert.equal(badLogin.status,401,"wrong password rejected");
const staffLogin = await handleAuthRoute(new Request("https://example.test/api/auth/login",{
  method:"POST",headers:{"content-type":"application/json"},
  body:JSON.stringify({role:"staff",email:"staff@example.com",password:"any-password"})
}),env);
assert.equal(staffLogin.status,401,"staff cannot log in without an approved account");
const publicStaffRequest = await handleAuthRoute(new Request("https://example.test/api/auth/staff/register",{
  method:"POST",headers:{"content-type":"application/json"},
  body:JSON.stringify({name:"Test Staff",email:"bad-email"})
}),env);
assert.equal(publicStaffRequest.status,400,"invalid staff registration email rejected");
console.log("AUTH_SESSION_TESTS_PASSED: owner login/session, unauthorized API block, public intake, wrong password, unapproved staff blocked, invalid staff registration rejected");
