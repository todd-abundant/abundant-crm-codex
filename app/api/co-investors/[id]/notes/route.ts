import { createEntityNotesHandlers } from "@/lib/entity-content-routes";

const handlers = createEntityNotesHandlers("CO_INVESTOR", "co-investor");

export const GET = handlers.GET;
export const POST = handlers.POST;
export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
