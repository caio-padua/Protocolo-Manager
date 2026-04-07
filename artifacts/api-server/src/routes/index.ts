import { Router, type IRouter } from "express";
import healthRouter from "./health";
import clientsRouter from "./clients";
import substancesRouter from "./substances";
import professionalsRouter from "./professionals";
import locationsRouter from "./locations";
import protocolsRouter from "./protocols";
import sessionsRouter from "./sessions";
import rasRouter from "./ras";
import stockRouter from "./stock";
import paymentsRouter from "./payments";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(clientsRouter);
router.use(substancesRouter);
router.use(professionalsRouter);
router.use(locationsRouter);
router.use(protocolsRouter);
router.use(sessionsRouter);
router.use(rasRouter);
router.use(stockRouter);
router.use(paymentsRouter);
router.use(dashboardRouter);

export default router;
