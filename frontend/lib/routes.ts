import type { Route } from "next";

/**
 * Clerk's sign-in/sign-up pages are optional catch-all routes
 * (app/(auth)/sign-in/[[...sign-in]]), so Next's typedRoutes generates
 * "/sign-in/[[...sign-in]]" as the literal route type — "/sign-in" itself
 * (which is what users actually navigate to and what Clerk expects as a
 * redirect target) isn't a member of that generated union. The cast below
 * is the documented workaround; the runtime route is correct.
 */
export const SIGN_IN_ROUTE = "/sign-in" as Route;
export const SIGN_UP_ROUTE = "/sign-up" as Route;
