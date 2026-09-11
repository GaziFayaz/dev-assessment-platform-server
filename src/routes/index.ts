import { Router } from "express";
import { healthRouter } from "./health.route.js";

const apiV1Router = Router();

// System routes
apiV1Router.use("/health", healthRouter);

// Domain routes will be mounted here by feature modules:
// apiV1Router.use("/problems", problemRouter);
// apiV1Router.use("/assessments", assessmentRouter);
// apiV1Router.use("/invitations", invitationRouter);
// apiV1Router.use("/attempts", attemptRouter);
// apiV1Router.use("/evaluations", evaluationRouter);
// apiV1Router.use("/reports", reportRouter);

export { apiV1Router };
