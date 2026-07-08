import { getUser, onAuthStateChange } from "./supabase-client.js";

function redirectToLogin() {
  window.location.assign("/login.html");
}

getUser()
  .then((user) => {
    if (!user) redirectToLogin();
    else document.body.classList.remove("auth-checking");
  })
  .catch(() => {
    redirectToLogin();
  });

onAuthStateChange((session) => {
  if (!session?.user) redirectToLogin();
});
