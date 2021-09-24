import { callbacks } from '../../../../../app/callbacks/server';
import { LivechatInquiry, Subscriptions, LivechatRooms } from '../../../../../app/models/server';
import { queueInquiry } from '../../../../../app/livechat/server/lib/QueueManager';
import { settings } from '../../../../../app/settings/server';
import { logger } from '../lib/logger';

const handleOnAgentAssignmentFailed = async ({ inquiry, room, options }: { inquiry: any; room: any; options: { forwardingToDepartment?: { oldDepartmentId: string; transferData: any }; clientAction?: boolean} }): Promise<any> => {
	if (!inquiry || !room) {
		(logger as any).cb.debug('Skipping callback. No inquiry or room provided');
		return;
	}

	if (room.onHold) {
		(logger as any).cb.debug('Room is on hold. Removing current assignations before queueing again');
		const { _id: roomId } = room;

		const { _id: inquiryId } = inquiry;
		LivechatInquiry.readyInquiry(inquiryId);
		LivechatInquiry.removeDefaultAgentById(inquiryId);
		LivechatRooms.removeAgentByRoomId(roomId);
		Subscriptions.removeByRoomId(roomId);
		const newInquiry = LivechatInquiry.findOneById(inquiryId);

		await queueInquiry(room, newInquiry);

		(logger as any).cb.debug('Room queued successfully');
		return;
	}

	if (!settings.get('Livechat_waiting_queue')) {
		(logger as any).cb.debug('Skipping callback. Queue disabled by setting');
		return;
	}

	const { forwardingToDepartment: { oldDepartmentId } = {}, forwardingToDepartment } = options;
	if (!forwardingToDepartment) {
		(logger as any).cb.debug('Skipping callback. Room not being forwarded to department');
		return;
	}

	const { department: newDepartmentId } = inquiry;

	if (!newDepartmentId || !oldDepartmentId || newDepartmentId === oldDepartmentId) {
		(logger as any).cb.debug('Skipping callback. New and old departments are the same');
		return;
	}

	room.chatQueued = true;
	return room;
};

callbacks.add('livechat.onAgentAssignmentFailed', handleOnAgentAssignmentFailed, callbacks.priority.HIGH, 'livechat-agent-assignment-failed');
