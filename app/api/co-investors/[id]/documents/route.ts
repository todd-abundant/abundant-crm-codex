import { createEntityDocumentsHandlers } from "@/lib/entity-content-routes";

const handlers = createEntityDocumentsHandlers("CO_INVESTOR", "co-investor");

export const GET = handlers.GET;
export const POST = handlers.POST;
export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
