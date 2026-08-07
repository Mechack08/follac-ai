import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";

export const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001";

export const authClient = createAuthClient({
  baseURL: `${API_URL}/api/auth`,
  plugins: [
    inferAdditionalFields({
      user: {
        role: { type: "string", input: false },
        stripeCustomerId: { type: "string", required: false, input: false },
      },
    }),
  ],
});

export const { useSession, signIn, signUp, signOut } = authClient;
