import { Router, type IRouter } from "express";
import healthRouter from "./health";
import commentsRouter from "./comments";
import movieMetaRouter from "./movieMeta";
import githubRouter from "./github";

const router: IRouter = Router();

router.use(healthRouter);
router.use(commentsRouter);
router.use(movieMetaRouter);
router.use(githubRouter);

export default router;
