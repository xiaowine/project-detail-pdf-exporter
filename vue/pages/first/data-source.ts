import { isEDA } from '../../utils/utils';

import { formatTeamName, formatWorkspaceName } from './formatters';
import type { CategoryDataMap } from './types';

type SchematicNetlistSnapshot = {
	documentUuid: string;
	documentName: string;
	fileName: string;
	content: string;
};

type PcbNetlistSnapshot = {
	documentUuid: string;
	documentName: string;
	content: string;
	viaCount: number;
	lineCount: number;
	dimensionCount: number;
	componentCount: number;
	padCount: number;
	netCount: number;
	fillCount: number;
	imageCount: number;
	pouredCount: number;
	prohibitRegionCount: number;
	constraintRegionCount: number;
};

type ProjectNetlistSnapshots = {
	schematic: SchematicNetlistSnapshot[];
	pcb: PcbNetlistSnapshot[];
};

type SchematicDocumentTarget = {
	name: string;
	openUuid: string;
};

function collectDesignDocumentMaps(projectInfo?: IDMT_ProjectItem): {
	schematicDocuments: Map<string, SchematicDocumentTarget>;
	pcbDocuments: Map<string, string>;
} {
	const schematicDocuments = new Map<string, SchematicDocumentTarget>();
	const pcbDocuments = new Map<string, string>();

	if (!projectInfo) {
		return { schematicDocuments, pcbDocuments };
	}

	const upsertSchematic = (schematic: IDMT_SchematicItem) => {
		if (!schematic.uuid) {
			return;
		}
		const firstPageUuid = Array.isArray(schematic.page) && schematic.page.length > 0
			? schematic.page[0]?.uuid
			: undefined;
		const previous = schematicDocuments.get(schematic.uuid);
		if (previous?.openUuid) {
			return;
		}
		schematicDocuments.set(schematic.uuid, {
			name: schematic.name ?? '',
			openUuid: firstPageUuid || schematic.uuid,
		});
	};

	for (const item of projectInfo.data) {
		switch (item.itemType) {
			case EDMT_ItemType.BOARD:
				if (item.schematic?.uuid) {
					upsertSchematic(item.schematic);
				}
				if (item.pcb?.uuid) {
					pcbDocuments.set(item.pcb.uuid, item.pcb.name ?? '');
				}
				break;
			case EDMT_ItemType.SCHEMATIC:
			case EDMT_ItemType.CBB_SCHEMATIC:
				upsertSchematic(item);
				break;
			case EDMT_ItemType.PCB:
			case EDMT_ItemType.CBB_PCB:
				pcbDocuments.set(item.uuid, item.name ?? '');
				break;
		}
	}

	return { schematicDocuments, pcbDocuments };
}

async function readNetlistFile(file: File): Promise<string> {
	try {
		return await file.text();
	} catch {
		return '';
	}
}

async function collectPcbPrimitiveStats(): Promise<{
	viaCount: number;
	lineCount: number;
	dimensionCount: number;
	componentCount: number;
	padCount: number;
	netCount: number;
	fillCount: number;
	imageCount: number;
	pouredCount: number;
	prohibitRegionCount: number;
	constraintRegionCount: number;
}> {
	const [viaResult, lineResult, dimensionResult, componentResult, padResult, fillResult, imageResult, pouredResult, prohibitRegionResult, constraintRegionResult] = await Promise.allSettled([
		eda.pcb_PrimitiveVia.getAll(),
		eda.pcb_PrimitiveLine.getAllPrimitiveId(),
		eda.pcb_PrimitiveDimension.getAll(),
		eda.pcb_PrimitiveComponent.getAll(),
		eda.pcb_PrimitivePad.getAll(),
		eda.pcb_PrimitiveFill.getAllPrimitiveId(),
		eda.pcb_PrimitiveImage.getAllPrimitiveId(),
		eda.pcb_PrimitivePoured.getAll(),
		eda.pcb_PrimitiveRegion.getAllPrimitiveId(undefined, [
			EPCB_PrimitiveRegionRuleType.NO_COMPONENTS,
			EPCB_PrimitiveRegionRuleType.NO_VIAS,
			EPCB_PrimitiveRegionRuleType.NO_WIRES,
			EPCB_PrimitiveRegionRuleType.NO_FILLS,
			EPCB_PrimitiveRegionRuleType.NO_POURS,
			EPCB_PrimitiveRegionRuleType.NO_INNER_ELECTRICAL_LAYERS,
		]),
		eda.pcb_PrimitiveRegion.getAllPrimitiveId(undefined, [EPCB_PrimitiveRegionRuleType.FOLLOW_REGION_RULE]),
	]);

	const viaCount = viaResult.status === 'fulfilled' ? viaResult.value.length : 0;
	const dimensionCount = dimensionResult.status === 'fulfilled' ? dimensionResult.value.length : 0;
	const componentCount = componentResult.status === 'fulfilled' ? componentResult.value.length : 0;
	const allPadPrimitiveIdSet = new Set<string>();
	const componentPadPrimitiveIdSet = new Set<string>();
	const padNetNameSet = new Set<string>();

	if (padResult.status === 'fulfilled') {
		for (const pad of padResult.value) {
			const primitiveId = pad.getState_PrimitiveId();
			if (primitiveId) {
				allPadPrimitiveIdSet.add(primitiveId);
			}
			const netName = pad.getState_Net()?.trim();
			if (netName) {
				padNetNameSet.add(netName);
			}
		}
	}

	if (componentResult.status === 'fulfilled') {
		for (const component of componentResult.value) {
			const pads = component.getState_Pads() ?? [];
			for (const pad of pads) {
				if (pad?.primitiveId) {
					componentPadPrimitiveIdSet.add(pad.primitiveId);
				}
				const netName = pad?.net?.trim();
				if (netName) {
					padNetNameSet.add(netName);
				}
			}
		}
	}

	let padCount = 0;
	if (allPadPrimitiveIdSet.size > 0 && componentPadPrimitiveIdSet.size > 0) {
		for (const primitiveId of componentPadPrimitiveIdSet) {
			if (allPadPrimitiveIdSet.has(primitiveId)) {
				padCount += 1;
			}
		}
	} else if (allPadPrimitiveIdSet.size > 0) {
		padCount = allPadPrimitiveIdSet.size;
	} else if (componentPadPrimitiveIdSet.size > 0) {
		padCount = componentPadPrimitiveIdSet.size;
	}

	return {
		viaCount,
		lineCount: lineResult.status === 'fulfilled' ? lineResult.value.length : 0,
		dimensionCount,
		componentCount,
		padCount,
		netCount: padNetNameSet.size,
		fillCount: fillResult.status === 'fulfilled' ? fillResult.value.length : 0,
		imageCount: imageResult.status === 'fulfilled' ? imageResult.value.length : 0,
		pouredCount: pouredResult.status === 'fulfilled' ? pouredResult.value.length : 0,
		prohibitRegionCount: prohibitRegionResult.status === 'fulfilled' ? prohibitRegionResult.value.length : 0,
		constraintRegionCount: constraintRegionResult.status === 'fulfilled' ? constraintRegionResult.value.length : 0,
	};
}

async function collectProjectNetlists(projectInfo?: IDMT_ProjectItem): Promise<ProjectNetlistSnapshots> {
	const snapshots: ProjectNetlistSnapshots = {
		schematic: [],
		pcb: [],
	};
	const { schematicDocuments, pcbDocuments } = collectDesignDocumentMaps(projectInfo);
	const currentDocument = await eda.dmt_SelectControl.getCurrentDocumentInfo().catch(() => undefined);
	const originalDocumentUuid = currentDocument?.uuid;
	const originalTabId = currentDocument?.tabId;

	for (const [documentUuid, target] of schematicDocuments.entries()) {
		const documentName = target.name;
		const openUuid = target.openUuid;
		let openedTabId: string | undefined;
		try {
			openedTabId = await eda.dmt_EditorControl.openDocument(openUuid);
			if (!openedTabId) {
				continue;
			}

			const netlistFile = await eda.sch_ManufactureData.getNetlistFile(undefined, ESYS_NetlistType.JLCEDA_PRO);
			if (!netlistFile) {
				continue;
			}
			snapshots.schematic.push({
				documentUuid,
				documentName,
				fileName: netlistFile.name || `${documentName || documentUuid}.net`,
				content: await readNetlistFile(netlistFile),
			});
		} catch {
			// Ignore single document failure and keep collecting.
		} finally {
			if (openedTabId) {
				if (openedTabId === originalTabId) {
				} else {
					await eda.dmt_EditorControl.closeDocument(openedTabId).catch(() => false);
				}
			}
		}
	}

	for (const [documentUuid, documentName] of pcbDocuments.entries()) {
		let openedTabId: string | undefined;
		try {
			openedTabId = await eda.dmt_EditorControl.openDocument(documentUuid);
			if (!openedTabId) {
				continue;
			}
			const netlist = await eda.pcb_Net.getNetlist(ESYS_NetlistType.JLCEDA_PRO);
			const pcbStats = await collectPcbPrimitiveStats();
			snapshots.pcb.push({
				documentUuid,
				documentName,
				content: netlist,
				viaCount: pcbStats.viaCount,
				lineCount: pcbStats.lineCount,
				dimensionCount: pcbStats.dimensionCount,
				componentCount: pcbStats.componentCount,
				padCount: pcbStats.padCount,
				netCount: pcbStats.netCount,
				fillCount: pcbStats.fillCount,
				imageCount: pcbStats.imageCount,
				pouredCount: pcbStats.pouredCount,
				prohibitRegionCount: pcbStats.prohibitRegionCount,
				constraintRegionCount: pcbStats.constraintRegionCount,
			});
		} catch {
			// Ignore single document failure and keep collecting.
		} finally {
			if (openedTabId) {
				if (openedTabId === originalTabId) {
				} else {
					await eda.dmt_EditorControl.closeDocument(openedTabId).catch(() => false);
				}
			}
		}
	}

	if (originalDocumentUuid) {
		await eda.dmt_EditorControl.openDocument(originalDocumentUuid).catch(() => undefined);
	}
	return snapshots;
}

export async function collectData(): Promise<CategoryDataMap> {
	if (!isEDA) {
		return {
			环境: {
				提示: '当前不在 EDA 运行环境，无法读取实时信息。',
			},
		};
	}

	const userInfo = eda.sys_Environment.getUserInfo();
	const projectInfo = await eda.dmt_Project.getCurrentProjectInfo();
	const collectedNetlists = await collectProjectNetlists(projectInfo);
	const totalViaCount = collectedNetlists.pcb.reduce((sum, item) => sum + item.viaCount, 0);
	const totalLineCount = collectedNetlists.pcb.reduce((sum, item) => sum + item.lineCount, 0);
	const totalDimensionCount = collectedNetlists.pcb.reduce((sum, item) => sum + item.dimensionCount, 0);
	const totalComponentCount = collectedNetlists.pcb.reduce((sum, item) => sum + item.componentCount, 0);
	const totalPadCount = collectedNetlists.pcb.reduce((sum, item) => sum + item.padCount, 0);
	const totalNetCount = collectedNetlists.pcb.reduce((sum, item) => sum + item.netCount, 0);
	const totalFillCount = collectedNetlists.pcb.reduce((sum, item) => sum + item.fillCount, 0);
	const totalImageCount = collectedNetlists.pcb.reduce((sum, item) => sum + item.imageCount, 0);
	const totalPouredCount = collectedNetlists.pcb.reduce((sum, item) => sum + item.pouredCount, 0);
	const totalProhibitRegionCount = collectedNetlists.pcb.reduce((sum, item) => sum + item.prohibitRegionCount, 0);
	const totalConstraintRegionCount = collectedNetlists.pcb.reduce((sum, item) => sum + item.constraintRegionCount, 0);

	let board_cnt = 0;
	let pcb_cnt = 0;
	let sch_cnt = 0;
	let sch_page_cnt = 0;
	let sch_size: string[] = [];
	let sch_name: string[] = [];
	let panel_cnt = 0;

	if (projectInfo) {
		const pcbUuidSet = new Set<string>();
		const schematicUuidSet = new Set<string>();
		const schematicPageCountMap = new Map<string, number>();
		const panelUuidSet = new Set<string>();

		const collectSchematic = (schematic: IDMT_SchematicItem) => {
			schematicUuidSet.add(schematic.uuid);
			const pageCount = Array.isArray(schematic.page) ? schematic.page.length : 0;
			const previousPageCount = schematicPageCountMap.get(schematic.uuid) ?? 0;
			if (pageCount > previousPageCount) {
				schematicPageCountMap.set(schematic.uuid, pageCount);
			}
		};

		for (const item of projectInfo.data) {
			switch (item.itemType) {
				case EDMT_ItemType.BOARD:
					board_cnt += 1;
					if (item.pcb?.uuid) {
						pcbUuidSet.add(item.pcb.uuid);
					}
					if (item.schematic?.uuid) {
						item.schematic.page.forEach((page) => {
							sch_size.push(page.titleBlockData?.["Page Size"]?.value);
							sch_name.push(page.titleBlockData?.["Symbol"]?.value);
						});
						collectSchematic(item.schematic);
					}
					break;
				case EDMT_ItemType.PCB:
				case EDMT_ItemType.CBB_PCB:
					pcbUuidSet.add(item.uuid);
					break;
				case EDMT_ItemType.SCHEMATIC:
				case EDMT_ItemType.CBB_SCHEMATIC:
					item.page.forEach((page) => {
						sch_size.push(page.titleBlockData?.["Page Size"]?.value);
						sch_name.push(page.titleBlockData?.["Symbol"]?.value);
					});
					collectSchematic(item);
					break;
				case EDMT_ItemType.PANEL:
					panelUuidSet.add(item.uuid);
					break;
			}
		}

		pcb_cnt = pcbUuidSet.size;
		sch_cnt = schematicUuidSet.size;
		sch_page_cnt = Array.from(schematicPageCountMap.values()).reduce((sum, pageCount) => sum + pageCount, 0);
		panel_cnt = panelUuidSet.size;
		sch_size = [...new Set(sch_size.filter(size => size !== undefined))];
		sch_name = [...new Set(sch_name.filter(name => name !== undefined))];
	}

	const data = {
		EDA环境: {
			EDA编译时间: eda.sys_Environment.getEditorCompliedDate(),
			EDA当前版本: eda.sys_Environment.getEditorCurrentVersion(),
			是否半离线版本: eda.sys_Environment.isHalfOfflineMode(),
			是否在线版本: eda.sys_Environment.isOnlineMode(),
			是否网页环境: eda.sys_Environment.isWeb(),
			是否客户端环境: eda.sys_Environment.isClient(),
		},
		工程师信息: {
			名称: userInfo.username,
			客编: userInfo.customerCode,
			工作区信息: formatWorkspaceName(await eda.dmt_Workspace.getCurrentWorkspaceInfo()),
			当前团队: formatTeamName(await eda.dmt_Team.getCurrentTeamInfo()),
		},
		工程信息: {
			工程友好名称: projectInfo?.friendlyName || '未打开工程',
			工程链接名称: projectInfo?.name || '未打开工程',
			工程描述: projectInfo?.description || '无描述',
			板数量: board_cnt,
			PCB数量: pcb_cnt,
			面板数量: panel_cnt,
		},
		原理图信息: {
			原理图数量: sch_cnt,
			图页数量: sch_page_cnt,
			图页大小: `${sch_size.length}种图页大小（${sch_size.join(', ')}）`,
			图页名称: `${sch_name.length}种图页名称（${sch_name.join(', ')}）`,
		},
		PCB信息: {
			PCB数量: pcb_cnt,
			过孔数量: totalViaCount,
			线条数量: totalLineCount,
			尺寸标注数量: totalDimensionCount,
			器件数量: totalComponentCount,
			焊盘数量: totalPadCount,
			网络数量: totalNetCount,
			填充数量: totalFillCount,
			图像数量: totalImageCount,
			覆铜填充数量: totalPouredCount,
			禁止区域数量: totalProhibitRegionCount,
			约束区域数量: totalConstraintRegionCount,
		},
	};

	return data;
}
