import { Meteor } from 'meteor/meteor';

import { callbacks } from '../../../../../app/callbacks';
import { Users } from '../../../../../app/models/server/raw';
import { settings } from '../../../../../app/settings';
import { getMaxNumberSimultaneousChat } from '../lib/Helper';
import { allowAgentSkipQueue } from '../../../../../app/livechat/server/lib/Helper';
import { logger } from '../lib/logger';

callbacks.add('livechat.checkAgentBeforeTakeInquiry', async ({ agent, inquiry, options }) => {
	if (!settings.get('Livechat_waiting_queue')) {
		logger.cb.debug('Skipping callback. Disabled by setting');
		return agent;
	}

	if (!inquiry || !agent) {
		logger.cb.debug('Callback with error. No inquiry or agent provided');
		return null;
	}

	if (allowAgentSkipQueue(agent)) {
		logger.cb.debug(`Callback success. Agent ${ agent.agentId } can skip queue`);
		return agent;
	}

	const { department: departmentId } = inquiry;
	const { agentId } = agent;

	const maxNumberSimultaneousChat = getMaxNumberSimultaneousChat({ agentId, departmentId });
	if (maxNumberSimultaneousChat === 0) {
		logger.cb.debug(`Callback success. Agent ${ agentId } max number simultaneous chats on range`);
		return agent;
	}

	const user = await Users.getAgentAndAmountOngoingChats(agentId);
	if (!user) {
		logger.cb.debug('Callback with error. No valid agent found');
		return null;
	}

	const { queueInfo: { chats = 0 } = {} } = user;
	if (maxNumberSimultaneousChat <= chats) {
		logger.cb.debug('Callback with error. Agent reached max amount of simultaneous chats');
		callbacks.run('livechat.onMaxNumberSimultaneousChatsReached', inquiry);
		if (options.clientAction && !options.forwardingToDepartment) {
			throw new Meteor.Error('error-max-number-simultaneous-chats-reached', 'Not allowed');
		}

		return null;
	}

	logger.cb.debug(`Callback success. Agent ${ agentId } can take inquiry ${ inquiry._id }`);
	return agent;
}, callbacks.priority.MEDIUM, 'livechat-before-take-inquiry');
