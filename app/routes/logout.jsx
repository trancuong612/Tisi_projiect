import { logout } from "../utils/auth.server";

export async function action({ request }) {
  return logout(request);
}

export async function loader() {
  throw new Response("Method Not Allowed", {
    status: 405,
  });
}
