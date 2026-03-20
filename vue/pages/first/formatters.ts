export function formatValue(value: unknown): string {
	if (typeof value === 'string') return value;
	if (typeof value === 'number') return String(value);
	if (typeof value === 'boolean') return value ? '是' : '否';
	if (value === null) return '未知';
	if (value === undefined) return '未知';

	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
}

export function formatTeamName(teamInfo: IDMT_TeamItem | undefined): string {
	return teamInfo?.name || '无团队';
}

export function formatWorkspaceName(workspaceInfo: IDMT_WorkspaceItem | undefined): string {
	if (workspaceInfo?.name === 'Personal') {
		return '个人';
	}

	return workspaceInfo?.name || '无工作区';
}
