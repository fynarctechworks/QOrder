import { Router } from 'express';
import { authenticate } from '../middlewares/auth.js';
import { chatbotController } from '../controllers/chatbotController.js';

const router = Router();

// All chatbot endpoints require authentication
router.use(authenticate);

router.post('/message', chatbotController.chat);

export default router;
