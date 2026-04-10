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
import validationCodesRouter from "./validation-codes";
import emailRouter from "./email";
import googleCalendarRouter from "./google-calendar";
import googleDriveRouter from "./google-drive";
import clientPortalRouter from "./client-portal";

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
router.use(validationCodesRouter);
router.use(emailRouter);
router.use(googleCalendarRouter);
router.use("/google-drive", googleDriveRouter);
router.use(clientPortalRouter);

export default router;
