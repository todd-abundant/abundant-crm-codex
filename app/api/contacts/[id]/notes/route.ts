import { createEntityNotesHandlers } from "@/lib/entity-content-routes";

const handlers = createEntityNotesHandlers("CONTACT", "contact");

export const GET = handlers.GET;
export const POST = handlers.POST;
export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
