import { Router, type IRouter } from "express";
import healthRouter from "./health";
import commentsRouter from "./comments";
import movieMetaRouter from "./movieMeta";

const router: IRouter = Router();

router.use(healthRouter);
router.use(commentsRouter);
router.use(movieMetaRouter);

export default router;
