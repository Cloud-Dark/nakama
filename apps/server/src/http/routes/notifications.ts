import { createRoute, z } from "@hono/zod-openapi";
import type { ServerOptions } from "../context";
import { requireActiveOrgIdFromContext } from "../org-guards";
import { getRequestAuth, json } from "../shared";
import type { HonoApp } from "../types";

export function registerNotificationRoutes(
  app: HonoApp,
  options: ServerOptions
): void {
  const clearNotificationsHandler = async (c: any) => {
    const auth = getRequestAuth(c);
    const orgId = requireActiveOrgIdFromContext(c);
    const userId = auth.user?.id;
    const isOrgAdmin =
      auth.orgRole === "admin" || auth.isPlatformAdmin === true;

    let clearedAutomations = 0;
    let clearedSkillProposals = 0;
    let clearedOrgMemoryProposals = 0;

    // 1. Mark unread automations read for this user & org
    if (options.automationService && userId) {
      try {
        const { automations } = await options.automationService.listForOrg(
          orgId,
          userId
        );
        for (const auto of automations) {
          try {
            await options.automationService.markRunsRead(auto.id, orgId, userId);
            clearedAutomations++;
          } catch (e) {
            console.error("Failed to mark automation run read:", e);
          }
        }
      } catch (e) {
        console.error("Failed to list automations:", e);
      }
    }

    // 2. Reject pending skill proposals
    if (options.skillProposalService && (isOrgAdmin || auth.mode === "local-token")) {
      try {
        const reviewerId = userId || "system";
        const { proposals } = await options.skillProposalService.listProposals(
          orgId,
          { status: "pending" }
        );
        for (const prop of proposals) {
          try {
            await options.skillProposalService.rejectProposal(
              orgId,
              prop.id,
              reviewerId
            );
            clearedSkillProposals++;
          } catch (e) {
            console.error("Failed to reject skill proposal:", e);
          }
        }
      } catch (e) {
        console.error("Failed to list skill proposals:", e);
      }
    }

    // 3. Reject pending org memory proposals
    if (options.orgMemoryService && (isOrgAdmin || auth.mode === "local-token")) {
      try {
        const reviewerId = userId || "system";
        const proposals = await options.orgMemoryService.listProposals(
          orgId,
          "pending"
        );
        for (const prop of proposals) {
          try {
            await options.orgMemoryService.rejectProposal(
              orgId,
              prop.id,
              reviewerId
            );
            clearedOrgMemoryProposals++;
          } catch (e) {
            console.error("Failed to reject org memory proposal:", e);
          }
        }
      } catch (e) {
        console.error("Failed to list org memory proposals:", e);
      }
    }

    return json({
      cleared: {
        automations: clearedAutomations,
        orgMemoryProposals: clearedOrgMemoryProposals,
        skillProposals: clearedSkillProposals,
      },
      ok: true,
    });
  };

  const responseSchema = z
    .object({
      cleared: z.object({
        automations: z.number(),
        orgMemoryProposals: z.number(),
        skillProposals: z.number(),
      }),
      ok: z.boolean(),
    })
    .openapi("ClearNotificationsResponse");

  const deleteRoute = createRoute({
    method: "delete",
    operationId: "clearAllNotifications",
    path: "/v1/notifications",
    responses: {
      200: {
        content: {
          "application/json": { schema: responseSchema },
        },
        description: "All notifications cleared",
      },
    },
    summary: "Clear all notifications",
    tags: ["Notifications"],
  });

  const postRoute = createRoute({
    method: "post",
    operationId: "clearAllNotificationsPost",
    path: "/v1/notifications/clear-all",
    responses: {
      200: {
        content: {
          "application/json": { schema: responseSchema },
        },
        description: "All notifications cleared",
      },
    },
    summary: "Clear all notifications",
    tags: ["Notifications"],
  });

  app.openapi(deleteRoute, clearNotificationsHandler);
  app.openapi(postRoute, clearNotificationsHandler);
  app.delete("/v1/notifications", clearNotificationsHandler);
  app.post("/v1/notifications/clear-all", clearNotificationsHandler);
}
