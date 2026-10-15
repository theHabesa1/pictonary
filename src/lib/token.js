// The signed-in account's login token (kept in localStorage, sent with API calls and sockets).
const KEY = 'pictonary.token';

export function getToken() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(KEY, token);
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode — ignore */
  }
}
