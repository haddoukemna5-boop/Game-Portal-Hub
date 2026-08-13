import { Router, type IRouter } from "express";
import healthRouter from "./health";
import resultsRouter from "./results";
import progressRouter from "./progress";

const router: IRouter = Router();

router.use(healthRouter);
router.use(resultsRouter);
router.use(progressRouter);

export default router;
