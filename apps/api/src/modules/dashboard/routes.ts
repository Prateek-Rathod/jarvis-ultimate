import { Router } from "express";
import { prisma } from "../../database/client.js";
import { authenticate } from "../../middleware/authentication.js";

export const dashboardRouter = Router();
dashboardRouter.use(authenticate);

dashboardRouter.get("/summary", async (request, response, next) => {
  try {
    const userId = request.auth!.user.id;
    const now = new Date();
    const [openTasks, overdueTasks, highPriorityTasks, completedTasks, recentTasks] =
      await Promise.all([
        prisma.task.count({ where: { userId, status: "open" } }),
        prisma.task.count({ where: { userId, status: "open", dueAt: { lt: now } } }),
        prisma.task.count({ where: { userId, status: "open", priority: "high" } }),
        prisma.task.count({ where: { userId, status: "completed" } }),
        prisma.task.findMany({
          where: { userId, status: "open" },
          orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
          take: 5,
          select: { id: true, title: true, priority: true, dueAt: true },
        }),
      ]);
    response.json({
      success: true,
      data: { openTasks, overdueTasks, highPriorityTasks, completedTasks, recentTasks },
    });
  } catch (error) {
    next(error);
  }
});
