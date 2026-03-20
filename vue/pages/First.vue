<template>
	<section class="page">
		<section class="split">
			<section class="panel left-panel">
				<header class="header">
					<div>
						<h1 class="title">信息导出</h1>
						<p class="subtitle">按分类勾选要导出的字段，点击下载按钮即可下载PDF</p>
					</div>
					<div class="actions">
						<button class="btn btn-light" type="button" :disabled="loading || generating" @click="loadData">
							{{ loading ? '加载中...' : '刷新数据' }}
						</button>
						<button class="btn btn-primary" type="button"
							:disabled="loading || generating || !hasAnySelection" @click="exportPdf">
							{{ generating ? '生成中...' : '下载 PDF' }}
						</button>
					</div>
				</header>

				<section class="font-tools">
					<div class="font-tools-head">
						<span class="font-tools-label">PDF 字体</span>
						<div class="font-tools-actions">
							<button class="btn btn-light font-refresh-btn" type="button"
								:disabled="loading || generating || fontLoading || !canLoadLocalFonts"
								@click="loadLocalFonts">
								{{ fontLoading ? '读取中...' : '刷新' }}
							</button>
							<button class="icon-btn icon-collapse font-collapse-btn" type="button" title="展开/收起字体选择器"
								aria-label="展开或收起字体选择器" @click="toggleFontToolsCollapsed">
								{{ fontToolsCollapsed ? '▸' : '▾' }}
							</button>
						</div>
					</div>
					<div v-if="fontToolsCollapsed" class="font-collapsed-tip">
						已收起，点击右上角图标展开
					</div>
					<template v-else>
						<div class="font-grid">
							<label class="font-field">
								<span class="font-sub-label">字体</span>
								<select v-model="selectedLocalFontFamily" class="font-select"
									:disabled="loading || generating || fontLoading">
									<option value="">默认字体（不嵌入）</option>
									<option v-for="familyName in localFontFamilies" :key="familyName"
										:value="familyName">
										{{ familyName }}
									</option>
								</select>
							</label>
							<label class="font-field">
								<span class="font-sub-label">字重</span>
								<select v-model="selectedLocalFontPostscript" class="font-select"
									:disabled="loading || generating || fontLoading || !selectedLocalFontFamily">
									<option v-if="!selectedLocalFontFamily" value="">请先选择字体</option>
									<option v-for="fontStyleOption in selectedFamilyFontStyles"
										:key="fontStyleOption.postscriptName" :value="fontStyleOption.postscriptName">
										{{ fontStyleOption.label }}
									</option>
								</select>
							</label>
						</div>
						<p class="font-hint">{{ fontPermissionHint }}</p>
						<p v-if="fontErrorMessage" class="font-error">{{ fontErrorMessage }}</p>
					</template>
				</section>

				<p v-if="errorMessage" class="error">{{ errorMessage }}</p>

				<div v-if="categories.length === 0 && !loading" class="empty">暂无可导出的数据</div>

				<section v-for="categoryEntry in categories" :key="categoryEntry.category" class="category">
					<div class="category-head">
						<h2>{{ categoryEntry.category }}</h2>
						<div class="category-tools">
							<label class="check check-inline">
								<input class="check-input" type="checkbox"
									:checked="isCategoryFullySelected(categoryEntry.category)"
									@change="onCategoryCheckChange(categoryEntry.category, $event)" />
								<span class="check-label">全选</span>
							</label>
							<button class="icon-btn" type="button" title="分类上移" aria-label="分类上移"
								:disabled="!canMoveCategory(categoryEntry.category, -1)"
								@click="moveCategory(categoryEntry.category, -1)">
								⇡
							</button>
							<button class="icon-btn" type="button" title="分类下移" aria-label="分类下移"
								:disabled="!canMoveCategory(categoryEntry.category, 1)"
								@click="moveCategory(categoryEntry.category, 1)">
								⇣
							</button>
							<button class="icon-btn icon-collapse" type="button" title="展开/收起" aria-label="展开或收起"
								@click="toggleCategoryCollapsed(categoryEntry.category)">
								{{ isCategoryCollapsed(categoryEntry.category) ? '▸' : '▾' }}
							</button>
						</div>
					</div>

					<div v-if="isCategoryCollapsed(categoryEntry.category)" class="collapsed-tip">
						已收起，点击右侧图标展开
					</div>

					<div v-else class="items">
						<div v-for="itemKey in categoryEntry.orderedKeys" :key="itemKey" class="item" :class="[
							getDropClass(categoryEntry.category, itemKey),
							{ 'item-dragging': isDraggingItem(categoryEntry.category, itemKey) },
						]" @dragover="onItemDragOver(categoryEntry.category, itemKey, $event)"
							@drop="onItemDrop(categoryEntry.category, itemKey, $event)">
							<input class="item-check" type="checkbox"
								:checked="isItemSelected(categoryEntry.category, itemKey)"
								@change="onItemCheckChange(categoryEntry.category, itemKey, $event)" />
							<div class="item-main">
								<div class="item-key-row">
									<div class="item-key">{{ itemKey }}</div>
									<div class="item-controls">
										<span class="drag-handle" draggable="true" title="拖动排序"
											@dragstart="onItemDragStart(categoryEntry.category, itemKey, $event)"
											@dragend="onItemDragEnd">
											⋮⋮
										</span>
									</div>
								</div>
								<pre class="item-value">{{ formatValue(categoryEntry.categoryData[itemKey]) }}</pre>
							</div>
						</div>
					</div>
				</section>
			</section>

			<section class="panel preview-panel">
				<header class="preview-head">
					<h2>PDF 预览</h2>
					<p>勾选左侧内容后自动更新</p>
				</header>
				<div class="preview-body">
					<div v-if="previewLoading" class="preview-tip">预览生成中...</div>
					<div v-else-if="previewError" class="preview-tip preview-error">{{ previewError }}</div>
					<div v-else-if="!previewUrl" class="preview-tip">暂无可预览内容</div>
					<iframe v-else class="preview-frame" :src="previewUrl" title="PDF预览" />
				</div>
			</section>
		</section>
	</section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import * as extensionConfig from '../../extension.json';
import { collectData } from './first/data-source';
import { formatValue } from './first/formatters';
import {
	checkLocalFontPermission,
	createDocDefinition,
	getPdfMake,
	listLocalFontOptions,
	registerLocalFont,
	type LocalFontOption,
	type LocalFontPermissionState,
} from './first/pdf';
import {
	buildSelectedData,
	createCategoryOrder,
	createAllSelectedMap,
	createItemOrderMap,
	getOrderedCategories,
	getOrderedKeys,
	isCategoryFullySelected as isCategoryFullySelectedInMap,
} from './first/selection';
import type {
	CategoryDataMap,
	CategoryOrderList,
	ItemOrderByCategoryMap,
	SelectedByCategoryMap,
} from './first/types';
import { isEDA } from '../utils/utils';

type PersistedFirstPageState = {
	selectedByCategory?: SelectedByCategoryMap;
	selectedLocalFontFamily?: string;
	selectedLocalFontPostscript?: string;
	fontToolsCollapsed?: boolean;
};

const FIRST_PAGE_STATE_KEY = `${extensionConfig.name}__FirstPageState`;
const DEFAULT_LOCAL_FONT_FAMILY = 'Microsoft YaHei';

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function normalizeSelectedByCategory(rawValue: unknown): SelectedByCategoryMap | undefined {
	if (!isRecord(rawValue)) {
		return undefined;
	}

	const normalized: SelectedByCategoryMap = {};
	for (const [category, selectedList] of Object.entries(rawValue)) {
		if (!Array.isArray(selectedList)) {
			continue;
		}
		normalized[category] = selectedList
			.filter((item): item is string => typeof item === 'string')
			.map((item) => item.trim())
			.filter(Boolean);
	}
	return normalized;
}

function readPersistedFirstPageState(): PersistedFirstPageState | null {
	if (!isEDA) {
		return null;
	}

	try {
		const allConfigs = eda.sys_Storage.getExtensionAllUserConfigs() as Record<string, unknown>;
		const rawState = allConfigs[FIRST_PAGE_STATE_KEY];
		if (!isRecord(rawState)) {
			return null;
		}

		return {
			selectedByCategory: normalizeSelectedByCategory(rawState.selectedByCategory),
			selectedLocalFontFamily:
				typeof rawState.selectedLocalFontFamily === 'string' ? rawState.selectedLocalFontFamily : undefined,
			selectedLocalFontPostscript:
				typeof rawState.selectedLocalFontPostscript === 'string'
					? rawState.selectedLocalFontPostscript
					: undefined,
			fontToolsCollapsed:
				typeof rawState.fontToolsCollapsed === 'boolean' ? rawState.fontToolsCollapsed : undefined,
		};
	} catch {
		return null;
	}
}

function cloneSelectedByCategory(source: SelectedByCategoryMap): SelectedByCategoryMap {
	return Object.fromEntries(
		Object.entries(source).map(([category, selectedList]) => [category, [...selectedList]])
	);
}

const initialPersistedState = readPersistedFirstPageState();
let latestPersistedState: PersistedFirstPageState | null = initialPersistedState;

const data = ref<CategoryDataMap>({});
const categoryOrder = ref<CategoryOrderList>([]);
const selectedByCategory = ref<SelectedByCategoryMap>({});
const itemOrderByCategory = ref<ItemOrderByCategoryMap>({});
const collapsedByCategory = ref<Record<string, boolean>>({});
const draggingItem = ref<{ category: string; itemKey: string } | null>(null);
const dropTarget = ref<{ category: string; itemKey: string; position: 'before' | 'after' } | null>(null);
const dragGhost = ref<HTMLElement | null>(null);

const loading = ref(false);
const generating = ref(false);
const errorMessage = ref('');

const previewUrl = ref('');
const previewLoading = ref(false);
const previewError = ref('');
const fontPermissionState = ref<LocalFontPermissionState>('unsupported');
const fontLoading = ref(false);
const fontErrorMessage = ref('');
const localFonts = ref<LocalFontOption[]>([]);
const fontToolsCollapsed = ref(initialPersistedState?.fontToolsCollapsed ?? true);
const selectedLocalFontFamily = ref(
	initialPersistedState?.selectedLocalFontFamily?.trim() || DEFAULT_LOCAL_FONT_FAMILY
);
const selectedLocalFontPostscript = ref(initialPersistedState?.selectedLocalFontPostscript ?? '');

const categories = computed(() =>
	getOrderedCategories(data.value, categoryOrder.value).map((category) => ({
		category,
		categoryData: data.value[category] ?? {},
		orderedKeys: getOrderedKeys(category, data.value, itemOrderByCategory.value),
	}))
);

const hasAnySelection = computed(() =>
	Object.values(selectedByCategory.value).some((selectedList) => selectedList.length > 0)
);
const canLoadLocalFonts = computed(
	() => fontPermissionState.value !== 'unsupported' && fontPermissionState.value !== 'policy-blocked'
);
const localFontFamilies = computed(() => {
	const families = new Set(localFonts.value.map((fontOption) => fontOption.family));
	return Array.from(families).sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'));
});
const selectedFamilyFontStyles = computed(() => {
	const selectedFamily = selectedLocalFontFamily.value.trim();
	if (!selectedFamily) {
		return [];
	}

	const styleOptions = localFonts.value
		.filter((fontOption) => fontOption.family === selectedFamily)
		.sort(
			(left, right) =>
				left.style.localeCompare(right.style, 'zh-Hans-CN') ||
				left.fullName.localeCompare(right.fullName, 'zh-Hans-CN')
		);

	const styleCounts = new Map<string, number>();
	for (const fontOption of styleOptions) {
		styleCounts.set(fontOption.style, (styleCounts.get(fontOption.style) ?? 0) + 1);
	}

	return styleOptions.map((fontOption) => ({
		postscriptName: fontOption.postscriptName,
		label:
			(styleCounts.get(fontOption.style) ?? 0) > 1
				? `${fontOption.style} (${fontOption.fullName})`
				: fontOption.style,
	}));
});
const fontPermissionHint = computed(() => {
	switch (fontPermissionState.value) {
		case 'unsupported':
			return '当前浏览器不支持 Local Font Access API（需 HTTPS 与 Chromium 内核）。';
		case 'policy-blocked':
			return '当前站点被 Permissions Policy 限制，无法访问本地字体。';
		case 'denied':
			return '字体权限已拒绝，请在浏览器站点权限中改为允许后再重试。';
		case 'prompt':
			return '点击“刷新”后，浏览器会弹出权限确认。';
		case 'granted':
		default:
			return localFontFamilies.value.length > 0
				? `已授权，可选 ${localFontFamilies.value.length} 个本地字体。`
				: '已授权，点击按钮读取字体列表。';
	}
});

let previewToken = 0;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
const isRestoringPersistedState = ref(false);
const hasLoadedInitialData = ref(false);
let lastPersistedSignature = '';

function getPermissionBlockedReason(state: LocalFontPermissionState): string {
	switch (state) {
		case 'unsupported':
			return '当前浏览器不支持 Local Font Access API。';
		case 'policy-blocked':
			return '当前站点被 Permissions Policy 禁止访问本地字体。';
		case 'denied':
			return '本地字体权限已被拒绝，请在浏览器站点权限中允许后重试。';
		case 'prompt':
			return '尚未授予本地字体权限，请先点击“刷新”。';
		case 'granted':
		default:
			return '';
	}
}

function toggleFontToolsCollapsed() {
	fontToolsCollapsed.value = !fontToolsCollapsed.value;
}

function createPersistedStateSnapshot(): PersistedFirstPageState {
	return {
		selectedByCategory: cloneSelectedByCategory(selectedByCategory.value),
		selectedLocalFontFamily: selectedLocalFontFamily.value,
		selectedLocalFontPostscript: selectedLocalFontPostscript.value,
		fontToolsCollapsed: fontToolsCollapsed.value,
	};
}

function restoreSelectedByCategoryFromPersisted(
	source: CategoryDataMap,
	persistedSelectedByCategory?: SelectedByCategoryMap
) {
	if (!persistedSelectedByCategory) {
		return;
	}

	let hasAnyPersistedCategory = false;
	const restoredSelectedByCategory = createAllSelectedMap(source);
	for (const [category, categoryData] of Object.entries(source)) {
		if (!Object.prototype.hasOwnProperty.call(persistedSelectedByCategory, category)) {
			continue;
		}

		const persistedList = persistedSelectedByCategory[category];
		if (!Array.isArray(persistedList)) {
			continue;
		}

		hasAnyPersistedCategory = true;
		const categoryKeys = new Set(Object.keys(categoryData));
		restoredSelectedByCategory[category] = persistedList.filter((key) => categoryKeys.has(key));
	}

	if (hasAnyPersistedCategory) {
		selectedByCategory.value = restoredSelectedByCategory;
	}
}

async function persistFirstPageState() {
	if (!isEDA || !hasLoadedInitialData.value || isRestoringPersistedState.value) {
		return;
	}

	try {
		const snapshot = createPersistedStateSnapshot();
		const currentSignature = JSON.stringify(snapshot);
		if (currentSignature === lastPersistedSignature) {
			return;
		}

		const allConfigs = eda.sys_Storage.getExtensionAllUserConfigs() as Record<string, unknown>;
		await eda.sys_Storage.setExtensionAllUserConfigs({
			...allConfigs,
			[FIRST_PAGE_STATE_KEY]: snapshot,
		});
		latestPersistedState = snapshot;
		lastPersistedSignature = currentSignature;
	} catch (error: unknown) {
		console.warn('Persist first page state failed:', error);
	}
}

function schedulePersistFirstPageState() {
	if (isRestoringPersistedState.value) {
		return;
	}

	if (persistTimer) {
		clearTimeout(persistTimer);
	}

	persistTimer = setTimeout(() => {
		persistTimer = null;
		void persistFirstPageState();
	}, 250);
}

function sanitizeFileName(rawValue: string): string {
	return rawValue.replace(/[\\/:*?"<>|]/g, '_').trim();
}

function formatBackupTimestamp(date: Date): string {
	const pad = (value: number) => String(value).padStart(2, '0');
	return (
		`${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
		`-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
	);
}

async function backupProjectFileBeforeLoad() {
	if (!isEDA) {
		return;
	}

	const projectInfo = await eda.dmt_Project.getCurrentProjectInfo();
	if (!projectInfo) {
		return;
	}
	eda.sys_Message.showToastMessage('正在备份工程文件...', ESYS_ToastMessageType.INFO, 3);
	const projectName =
		sanitizeFileName(projectInfo.friendlyName || projectInfo.name || 'project-backup') || 'project-backup';
	const backupFileBaseName = `${projectName}-${formatBackupTimestamp(new Date())}`;
	const projectFile = await eda.sys_FileManager.getProjectFile(backupFileBaseName, undefined, 'epro2');

	if (!projectFile) {
		eda.sys_Message.showToastMessage('未能获取工程文件，无法完成备份。', ESYS_ToastMessageType.ERROR, 3);
		throw new Error('未能获取工程文件，无法完成备份。');

	}

	await eda.sys_FileSystem.saveFile(projectFile, projectFile.name);
	eda.sys_Message.showToastMessage(`工程文件已备份为 ${projectFile.name}。`, ESYS_ToastMessageType.SUCCESS, 3);
}

function resetSelections(source: CategoryDataMap) {
	selectedByCategory.value = createAllSelectedMap(source);
}

function resetCategoryOrders(source: CategoryDataMap) {
	categoryOrder.value = createCategoryOrder(source);
}

function resetItemOrders(source: CategoryDataMap) {
	itemOrderByCategory.value = createItemOrderMap(source);
}

function resetCollapsedState(source: CategoryDataMap) {
	collapsedByCategory.value = Object.fromEntries(Object.keys(source).map((category) => [category, false]));
}

function isCategoryFullySelected(category: string): boolean {
	return isCategoryFullySelectedInMap(category, data.value, selectedByCategory.value);
}

function isCategoryCollapsed(category: string): boolean {
	return collapsedByCategory.value[category] ?? false;
}

function toggleCategoryCollapsed(category: string) {
	collapsedByCategory.value[category] = !isCategoryCollapsed(category);
}

function canMoveCategory(category: string, direction: -1 | 1): boolean {
	const orderedCategories = getOrderedCategories(data.value, categoryOrder.value);
	const currentIndex = orderedCategories.indexOf(category);
	if (currentIndex < 0) return false;

	const targetIndex = currentIndex + direction;
	return targetIndex >= 0 && targetIndex < orderedCategories.length;
}

function moveCategory(category: string, direction: -1 | 1) {
	const orderedCategories = [...getOrderedCategories(data.value, categoryOrder.value)];
	const currentIndex = orderedCategories.indexOf(category);
	if (currentIndex < 0) return;

	const targetIndex = currentIndex + direction;
	if (targetIndex < 0 || targetIndex >= orderedCategories.length) return;

	[orderedCategories[currentIndex], orderedCategories[targetIndex]] = [
		orderedCategories[targetIndex],
		orderedCategories[currentIndex],
	];
	categoryOrder.value = orderedCategories;
}

function onCategoryCheckChange(category: string, event: Event) {
	const checked = (event.target as HTMLInputElement).checked;
	selectedByCategory.value[category] = checked ? getOrderedKeys(category, data.value, itemOrderByCategory.value) : [];
}

function isItemSelected(category: string, itemKey: string): boolean {
	return (selectedByCategory.value[category] ?? []).includes(itemKey);
}

function onItemCheckChange(category: string, itemKey: string, event: Event) {
	const checked = (event.target as HTMLInputElement).checked;
	const current = selectedByCategory.value[category] ?? [];

	if (checked) {
		if (current.includes(itemKey)) return;
		selectedByCategory.value[category] = [...current, itemKey];
		return;
	}

	selectedByCategory.value[category] = current.filter((key) => key !== itemKey);
}

function isDraggingItem(category: string, itemKey: string): boolean {
	return draggingItem.value?.category === category && draggingItem.value.itemKey === itemKey;
}

function getDropClass(category: string, itemKey: string): string {
	if (dropTarget.value?.category !== category || dropTarget.value.itemKey !== itemKey) {
		return '';
	}
	return dropTarget.value.position === 'before' ? 'item-drop-before' : 'item-drop-after';
}

function onItemDragStart(category: string, itemKey: string, event: DragEvent) {
	draggingItem.value = { category, itemKey };
	if (event.dataTransfer) {
		event.dataTransfer.effectAllowed = 'move';
		event.dataTransfer.setData('text/plain', `${category}:${itemKey}`);

		const ghost = document.createElement('div');
		ghost.className = 'drag-ghost';
		ghost.textContent = itemKey;
		document.body.appendChild(ghost);
		dragGhost.value = ghost;
		event.dataTransfer.setDragImage(ghost, 18, 10);
	}
}

function onItemDragEnd() {
	draggingItem.value = null;
	dropTarget.value = null;
	if (dragGhost.value) {
		dragGhost.value.remove();
		dragGhost.value = null;
	}
}

function resolveDropPosition(event: DragEvent): 'before' | 'after' {
	const currentTarget = event.currentTarget as HTMLElement | null;
	if (!currentTarget) return 'before';

	const rect = currentTarget.getBoundingClientRect();
	return event.clientY >= rect.top + rect.height / 2 ? 'after' : 'before';
}

function onItemDragOver(category: string, itemKey: string, event: DragEvent) {
	if (!draggingItem.value || draggingItem.value.category !== category) return;

	event.preventDefault();
	if (event.dataTransfer) {
		event.dataTransfer.dropEffect = 'move';
	}

	dropTarget.value = {
		category,
		itemKey,
		position: resolveDropPosition(event),
	};
}

function applyItemReorder(category: string, dragKey: string, targetKey: string, position: 'before' | 'after') {
	const keys = [...getOrderedKeys(category, data.value, itemOrderByCategory.value)];
	const dragIndex = keys.indexOf(dragKey);
	const targetIndex = keys.indexOf(targetKey);
	if (dragIndex < 0 || targetIndex < 0 || dragKey === targetKey) return;

	keys.splice(dragIndex, 1);

	let insertIndex = keys.indexOf(targetKey);
	if (insertIndex < 0) {
		insertIndex = keys.length;
	}
	if (position === 'after') {
		insertIndex += 1;
	}

	keys.splice(insertIndex, 0, dragKey);
	itemOrderByCategory.value[category] = keys;
}

function onItemDrop(category: string, itemKey: string, event: DragEvent) {
	if (!draggingItem.value || draggingItem.value.category !== category) return;

	event.preventDefault();
	const position = dropTarget.value?.itemKey === itemKey ? dropTarget.value.position : resolveDropPosition(event);

	applyItemReorder(category, draggingItem.value.itemKey, itemKey, position);
	dropTarget.value = null;
}

async function loadData() {
	loading.value = true;
	errorMessage.value = '';
	const selectedSnapshotForRefresh =
		hasLoadedInitialData.value ? cloneSelectedByCategory(selectedByCategory.value) : undefined;

	try {
		if (persistTimer) {
			clearTimeout(persistTimer);
			persistTimer = null;
		}
		await persistFirstPageState();
		await backupProjectFileBeforeLoad();

		isRestoringPersistedState.value = true;
		const source = await collectData();
		data.value = source;
		resetSelections(source);
		resetCategoryOrders(source);
		resetItemOrders(source);
		resetCollapsedState(source);
		const persistedStateForRestore = readPersistedFirstPageState() ?? latestPersistedState;
		restoreSelectedByCategoryFromPersisted(
			source,
			selectedSnapshotForRefresh ?? persistedStateForRestore?.selectedByCategory
		);
		hasLoadedInitialData.value = true;
		latestPersistedState = persistedStateForRestore;
		lastPersistedSignature = JSON.stringify(createPersistedStateSnapshot());
	} catch (error: unknown) {
		errorMessage.value = `读取数据失败：${error instanceof Error ? error.message : String(error)}`;
	} finally {
		isRestoringPersistedState.value = false;
		loading.value = false;
	}
}

async function refreshLocalFontPermission() {
	fontPermissionState.value = await checkLocalFontPermission();
}

async function loadLocalFonts() {
	fontLoading.value = true;
	fontErrorMessage.value = '';

	try {
		await refreshLocalFontPermission();
		if (!canLoadLocalFonts.value) {
			localFonts.value = [];
			selectedLocalFontFamily.value = '';
			selectedLocalFontPostscript.value = '';
			return;
		}

		const options = await listLocalFontOptions();
		localFonts.value = options;
		await refreshLocalFontPermission();

		if (options.length === 0) {
			fontErrorMessage.value = '未读取到本地字体，请检查浏览器权限或系统字体。';
			selectedLocalFontFamily.value = '';
			selectedLocalFontPostscript.value = '';
			return;
		}

		const selectedByPostscript = options.find(
			(item) => item.postscriptName === selectedLocalFontPostscript.value
		);
		if (selectedByPostscript) {
			selectedLocalFontFamily.value = selectedByPostscript.family;
			return;
		}

		if (!options.some((item) => item.family === selectedLocalFontFamily.value)) {
			selectedLocalFontFamily.value = options[0].family;
		}

		const firstInFamily = options.find((item) => item.family === selectedLocalFontFamily.value);
		if (firstInFamily) {
			selectedLocalFontPostscript.value = firstInFamily.postscriptName;
		}
	} catch (error: unknown) {
		fontErrorMessage.value = `读取本地字体失败：${error instanceof Error ? error.message : String(error)
			}`;
	} finally {
		fontLoading.value = false;
	}
}

async function resolvePdfFontName(): Promise<string | undefined> {
	const postscriptName = selectedLocalFontPostscript.value.trim();
	if (!postscriptName) {
		return undefined;
	}

	return registerLocalFont(postscriptName);
}

function resetPreviewUrl() {
	if (!previewUrl.value) return;
	URL.revokeObjectURL(previewUrl.value);
	previewUrl.value = '';
}

async function refreshPreview() {
	const pickedData = buildSelectedData(data.value, selectedByCategory.value, itemOrderByCategory.value, categoryOrder.value);
	previewError.value = '';

	if (Object.keys(pickedData).length === 0) {
		previewLoading.value = false;
		resetPreviewUrl();
		return;
	}

	await refreshLocalFontPermission();
	if (fontPermissionState.value !== 'granted') {
		previewLoading.value = false;
		previewError.value = `预览生成失败：${getPermissionBlockedReason(fontPermissionState.value)}`;
		resetPreviewUrl();
		return;
	}

	const currentToken = ++previewToken;
	previewLoading.value = true;

	try {
		const pdfMake = await getPdfMake();
		const fontName = await resolvePdfFontName();
		const docDefinition = createDocDefinition(pickedData, { fontName });
		const blob = await pdfMake.createPdf(docDefinition).getBlob();

		if (currentToken !== previewToken) return;

		resetPreviewUrl();
		previewUrl.value = URL.createObjectURL(blob);
	} catch (error: unknown) {
		if (currentToken !== previewToken) return;
		previewError.value = `预览生成失败：${error instanceof Error ? error.message : String(error)}`;
		resetPreviewUrl();
	} finally {
		if (currentToken === previewToken) {
			previewLoading.value = false;
		}
	}
}

async function exportPdf() {
	const pickedData = buildSelectedData(data.value, selectedByCategory.value, itemOrderByCategory.value, categoryOrder.value);
	if (Object.keys(pickedData).length === 0) return;

	generating.value = true;
	errorMessage.value = '';

	await refreshLocalFontPermission();
	if (fontPermissionState.value !== 'granted') {
		errorMessage.value = `生成 PDF 失败：${getPermissionBlockedReason(fontPermissionState.value)}`;
		generating.value = false;
		return;
	}

	try {
		const pdfMake = await getPdfMake();
		const fontName = await resolvePdfFontName();
		const docDefinition = createDocDefinition(pickedData, { fontName });
		await pdfMake.createPdf(docDefinition).download(`信息-${Date.now()}.pdf`);
	} catch (error: unknown) {
		errorMessage.value = `生成 PDF 失败：${error instanceof Error ? error.message : String(error)}`;
	}

	generating.value = false;
}

watch(selectedLocalFontFamily, (family) => {
	const normalizedFamily = family.trim();
	if (!normalizedFamily) {
		if (selectedLocalFontPostscript.value) {
			selectedLocalFontPostscript.value = '';
		}
		return;
	}

	const familyOptions = localFonts.value.filter((item) => item.family === normalizedFamily);
	if (familyOptions.length === 0) {
		selectedLocalFontPostscript.value = '';
		return;
	}

	if (!familyOptions.some((item) => item.postscriptName === selectedLocalFontPostscript.value)) {
		selectedLocalFontPostscript.value = familyOptions[0].postscriptName;
	}
});

watch(selectedLocalFontPostscript, (postscriptName) => {
	const normalizedPostscript = postscriptName.trim();
	if (!normalizedPostscript) {
		return;
	}

	const matchedOption = localFonts.value.find((item) => item.postscriptName === normalizedPostscript);
	if (matchedOption && matchedOption.family !== selectedLocalFontFamily.value) {
		selectedLocalFontFamily.value = matchedOption.family;
	}
});

watch(
	[selectedByCategory, selectedLocalFontFamily, selectedLocalFontPostscript, fontToolsCollapsed],
	() => {
		schedulePersistFirstPageState();
	},
	{ deep: true }
);

watch(
	[
		data,
		categoryOrder,
		selectedByCategory,
		itemOrderByCategory,
		selectedLocalFontFamily,
		selectedLocalFontPostscript,
	],
	() => {
		void refreshPreview();
	},
	{ deep: true }
);

watch(
	loading,
	(newVal) => {
		if (isEDA) {
			if (newVal) {
				eda.sys_LoadingAndProgressBar.showLoading();
			} else {
				eda.sys_LoadingAndProgressBar.destroyLoading();
			}
		}
	},
	{ flush: 'sync' },
);

onMounted(() => {
	void loadData();
	void (async () => {
		await refreshLocalFontPermission();
		if (fontPermissionState.value === 'granted') {
			await loadLocalFonts();
		}
	})();
});

onBeforeUnmount(() => {
	previewToken += 1;
	if (persistTimer) {
		clearTimeout(persistTimer);
		persistTimer = null;
	}
	void persistFirstPageState();
	if (dragGhost.value) {
		dragGhost.value.remove();
		dragGhost.value = null;
	}
	resetPreviewUrl();
});
</script>

<style lang="scss" scoped>
.page {
	box-sizing: border-box;
	width: 100%;
	height: 100%;
	padding: 16px;
	background: #f5f6fa;
	overflow: hidden;
}

.split {
	height: 100%;
	display: grid;
	grid-template-columns: 52% 48%;
	gap: 14px;
	min-width: 0;
}

.panel {
	display: flex;
	flex-direction: column;
	min-height: 0;
	border: 1px solid #d8dee8;
	border-radius: 10px;
	background: #ffffff;
}

.left-panel {
	overflow: auto;
	padding: 14px;
}

.header {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 12px;
	margin-bottom: 12px;
}

.title {
	margin: 0;
	font-size: 18px;
	line-height: 1.2;
}

.subtitle {
	margin: 6px 0 0;
	font-size: 12px;
	color: #4f5a6a;
}

.actions {
	display: flex;
	gap: 8px;
}

.font-tools {
	margin-bottom: 12px;
	padding: 12px;
	border: 1px solid #dbe4ef;
	border-radius: 10px;
	background: linear-gradient(180deg, #f8fbff 0%, #f3f7fd 100%);
}

.font-tools-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
	margin-bottom: 10px;
}

.font-tools-actions {
	display: inline-flex;
	align-items: center;
	gap: 8px;
}

.font-tools-label {
	font-size: 14px;
	font-weight: 600;
	color: #214a78;
	letter-spacing: 0.2px;
}

.font-sub-label {
	font-size: 12px;
	color: #3e556f;
}

.font-refresh-btn {
	min-width: 74px;
}

.font-collapse-btn {
	width: 32px;
	height: 32px;
	font-size: 16px;
}

.font-grid {
	display: grid;
	grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
	gap: 10px;
}

.font-field {
	display: flex;
	flex-direction: column;
	gap: 6px;
	min-width: 0;
}

.font-select {
	width: 100%;
	border: 1px solid #cfd9e6;
	border-radius: 6px;
	background: #fff;
	padding: 7px 10px;
	font-size: 12px;
	color: #1f2937;
	height: 38px;
	line-height: 1;
}

.font-hint {
	margin: 10px 0 0;
	font-size: 12px;
	color: #607082;
}

.font-error {
	margin: 6px 0 0;
	font-size: 12px;
	color: #c62828;
}

.font-collapsed-tip {
	font-size: 12px;
	color: #607082;
	padding: 8px 10px;
	background: #ffffff;
	border: 1px dashed #d3ddeb;
	border-radius: 8px;
}

@media (max-width: 980px) {
	.font-grid {
		grid-template-columns: 1fr;
	}

	.font-tools-head {
		align-items: flex-start;
	}

	.font-tools-actions {
		width: 100%;
		justify-content: flex-end;
	}
}

.btn {
	border: 1px solid #d0d7e2;
	border-radius: 6px;
	padding: 6px 12px;
	font-size: 13px;
	cursor: pointer;
}

.btn:disabled {
	cursor: not-allowed;
	opacity: 0.6;
}

.btn-light {
	background: #fff;
	color: #222;
}

.btn-primary {
	background: #1f6feb;
	border-color: #1f6feb;
	color: #fff;
}

.error {
	margin: 0 0 12px;
	color: #c62828;
	font-size: 13px;
}

.empty {
	color: #4f5a6a;
	font-size: 13px;
}

.category {
	margin-bottom: 14px;
	border: 1px solid #dde3ec;
	border-radius: 8px;
	background: #fff;
	padding: 12px;
}

.category-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	flex-wrap: wrap;
	gap: 8px;
	margin-bottom: 10px;
}

.category-head h2 {
	margin: 0;
	font-size: 15px;
}

.category-tools {
	display: flex;
	align-items: center;
	gap: 8px;
}

.check {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	font-size: 13px;
}

.check-inline {
	margin: 0;
	padding: 4px 8px;
	border: 1px solid #d0d7e2;
	border-radius: 999px;
	background: #f8fbff;
	cursor: pointer;
	transition: border-color 0.15s ease, background-color 0.15s ease;
}

.check-inline:hover {
	border-color: #9fbbe8;
	background: #f2f7ff;
}

.check-input {
	width: 14px;
	height: 14px;
	accent-color: #1f6feb;
	cursor: pointer;
}

.check-label {
	font-size: 12px;
	font-weight: 600;
	color: #2a3f5f;
	line-height: 1;
}

.icon-btn {
	border: 1px solid #d0d7e2;
	border-radius: 5px;
	width: 28px;
	height: 28px;
	background: #fff;
	font-size: 14px;
	line-height: 1;
	cursor: pointer;
}

.icon-btn:disabled {
	cursor: not-allowed;
	opacity: 0.6;
}

.icon-collapse {
	font-size: 15px;
}

.items {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.collapsed-tip {
	font-size: 12px;
	color: #607082;
	padding: 8px 6px;
	background: #f7f9fc;
	border: 1px dashed #d6deea;
	border-radius: 6px;
}

.item {
	position: relative;
	display: flex;
	align-items: flex-start;
	gap: 8px;
	padding: 8px;
	border-radius: 6px;
	background: #f8f9fc;
	border: 1px solid transparent;
}

.item-check {
	margin-top: 3px;
}

.item-main {
	flex: 1;
	min-width: 0;
}

.item-key-row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.item-key {
	font-size: 13px;
	font-weight: 600;
	color: #222;
}

.item-controls {
	display: flex;
	gap: 6px;
}

.drag-handle {
	user-select: none;
	border: 1px solid #d0d7e2;
	border-radius: 5px;
	padding: 0 8px;
	background: #fff;
	font-size: 15px;
	line-height: 1.6;
	cursor: grab;
}

.drag-handle:active {
	cursor: grabbing;
}

.item-value {
	margin: 4px 0 0;
	font-size: 12px;
	line-height: 1.4;
	color: #4f5a6a;
	white-space: pre-wrap;
	word-break: break-all;
}

.item-dragging {
	opacity: 0.45;
}

.item-drop-before::before {
	content: '';
	position: absolute;
	left: 8px;
	right: 8px;
	top: -3px;
	height: 2px;
	background: #1f6feb;
}

.item-drop-after::after {
	content: '';
	position: absolute;
	left: 8px;
	right: 8px;
	bottom: -3px;
	height: 2px;
	background: #1f6feb;
}

:global(.drag-ghost) {
	position: fixed;
	top: -1000px;
	left: -1000px;
	padding: 6px 10px;
	border-radius: 6px;
	border: 1px solid #c8d4e6;
	background: rgba(255, 255, 255, 0.95);
	color: #1f2937;
	font-size: 12px;
	box-shadow: 0 6px 14px rgba(18, 37, 63, 0.18);
	pointer-events: none;
	white-space: nowrap;
}

.preview-panel {
	padding: 12px;
}

.preview-head {
	padding: 2px 2px 10px;
	border-bottom: 1px solid #edf1f6;
}

.preview-head h2 {
	margin: 0;
	font-size: 16px;
}

.preview-head p {
	margin: 4px 0 0;
	font-size: 12px;
	color: #607082;
}

.preview-body {
	flex: 1;
	min-height: 0;
	display: flex;
	align-items: stretch;
	justify-content: stretch;
	padding-top: 10px;
}

.preview-tip {
	width: 100%;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 13px;
	color: #607082;
	background: #f7f9fc;
	border: 1px dashed #d6deea;
	border-radius: 8px;
}

.preview-error {
	color: #c62828;
}

.preview-frame {
	width: 100%;
	height: 100%;
	min-height: 360px;
	border: 1px solid #dde3ec;
	border-radius: 8px;
	background: white;
}
</style>
