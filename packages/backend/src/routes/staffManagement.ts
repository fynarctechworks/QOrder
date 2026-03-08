import { Router } from 'express';
import { staffManagementController } from '../controllers/staffManagementController.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { resolveBranch } from '../middlewares/resolveBranch.js';

const router = Router();

router.use(authenticate, resolveBranch);

const ownerAdmin = authorize('OWNER', 'ADMIN');
const ownerAdminManager = authorize('OWNER', 'ADMIN', 'MANAGER');
const allRoles = authorize('OWNER', 'ADMIN', 'MANAGER', 'STAFF');

// Shifts
router.get('/shifts', ownerAdminManager, staffManagementController.getShifts);
router.post('/shifts', ownerAdmin, staffManagementController.createShift);
router.patch('/shifts/:id', ownerAdmin, staffManagementController.updateShift);
router.delete('/shifts/:id', ownerAdmin, staffManagementController.deleteShift);

// Shift Assignments
router.get('/assignments', ownerAdminManager, staffManagementController.getAssignments);
router.post('/assignments', ownerAdminManager, staffManagementController.assignShift);
router.delete('/assignments/:id', ownerAdminManager, staffManagementController.removeAssignment);

// Attendance
router.get('/attendance', allRoles, staffManagementController.getAttendance);
router.get('/attendance/summary', allRoles, staffManagementController.getAttendanceSummary);
router.post('/attendance', allRoles, staffManagementController.markAttendance);
router.post('/attendance/checkout', allRoles, staffManagementController.checkOut);

// Leave Management
router.get('/leaves', allRoles, staffManagementController.getLeaves);
router.post('/leaves', allRoles, staffManagementController.requestLeave);
router.patch('/leaves/:id', allRoles, staffManagementController.updateLeaveStatus);

// Payroll
router.get('/payroll/config/:userId', ownerAdmin, staffManagementController.getPayrollConfig);
router.put('/payroll/config/:userId', ownerAdmin, staffManagementController.upsertPayrollConfig);
router.get('/payroll/runs', ownerAdmin, staffManagementController.getPayrollRuns);
router.post('/payroll/generate', ownerAdmin, staffManagementController.generatePayroll);
router.patch('/payroll/:id/paid', ownerAdmin, staffManagementController.markPayrollPaid);

export default router;
