import pdfMake from 'pdfmake/build/pdfmake';

import { formatValue } from './formatters';
import type { CategoryDataMap } from './types';

type PdfMakeStatic = (typeof import('pdfmake/build/pdfmake'))['default'];
type TableLayoutNode = {
	table: {
		body: unknown[][];
	};
};

type QueryLocalFontsOptions = {
	postscriptNames?: string[];
};

type LocalFontData = {
	family: string;
	fullName: string;
	postscriptName: string;
	style: string;
	blob(): Promise<Blob>;
};

type LocalFontsPermissionPolicy = {
	allowsFeature?: (featureName: string) => boolean;
};

type LocalFontFormat = 'ttf' | 'otf' | 'ttc' | 'woff' | 'woff2' | 'unknown';

export type LocalFontPermissionState = PermissionState | 'unsupported' | 'policy-blocked';

export type LocalFontOption = {
	family: string;
	fullName: string;
	postscriptName: string;
	style: string;
	label: string;
};

const LOCAL_FONT_ALIAS_PREFIX = 'LocalUserFont';
const localFontDataCache = new Map<string, LocalFontData>();
const localFontAliasCache = new Map<
	string,
	{
		fontAlias: string;
		fontFileName: string;
		fontFormat: LocalFontFormat;
	}
>();

function getQueryLocalFonts(): ((options?: QueryLocalFontsOptions) => Promise<LocalFontData[]>) | null {
	const maybeQueryLocalFonts = (
		globalThis as typeof globalThis & {
			queryLocalFonts?: (options?: QueryLocalFontsOptions) => Promise<LocalFontData[]>;
		}
	).queryLocalFonts;

	return typeof maybeQueryLocalFonts === 'function' ? maybeQueryLocalFonts : null;
}

function isLocalFontsAllowedByPolicy(): boolean {
	if (typeof document === 'undefined') {
		return true;
	}

	const policyContainer = document as Document & {
		permissionsPolicy?: LocalFontsPermissionPolicy;
		featurePolicy?: LocalFontsPermissionPolicy;
	};
	const policy = policyContainer.permissionsPolicy ?? policyContainer.featurePolicy;
	if (!policy || typeof policy.allowsFeature !== 'function') {
		return true;
	}

	try {
		return policy.allowsFeature('local-fonts');
	} catch {
		return true;
	}
}

function sanitizeFontKey(rawValue: string): string {
	return rawValue.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function buildLocalFontAlias(postscriptName: string): string {
	return `${LOCAL_FONT_ALIAS_PREFIX}_${sanitizeFontKey(postscriptName)}`;
}

function toAsciiTag(bytes: Uint8Array): string {
	return String.fromCharCode(...Array.from(bytes));
}

function detectLocalFontFormat(fontBytes: Uint8Array): LocalFontFormat {
	if (fontBytes.length < 4) {
		return 'unknown';
	}

	const signature = toAsciiTag(fontBytes.subarray(0, 4));
	if (signature === 'ttcf') {
		return 'ttc';
	}
	if (signature === 'OTTO') {
		return 'otf';
	}
	if (signature === 'wOFF') {
		return 'woff';
	}
	if (signature === 'wOF2') {
		return 'woff2';
	}

	if (
		(fontBytes[0] === 0x00 &&
			fontBytes[1] === 0x01 &&
			fontBytes[2] === 0x00 &&
			fontBytes[3] === 0x00) ||
		signature === 'true' ||
		signature === 'typ1'
	) {
		return 'ttf';
	}

	return 'unknown';
}

function buildLocalFontFileName(postscriptName: string, format: LocalFontFormat): string {
	const extensionMap: Record<Exclude<LocalFontFormat, 'unknown'>, string> = {
		ttf: 'ttf',
		otf: 'otf',
		ttc: 'ttc',
		woff: 'woff',
		woff2: 'woff2',
	};

	const extension = format === 'unknown' ? 'font' : extensionMap[format];
	return `${buildLocalFontAlias(postscriptName)}.${extension}`;
}

function buildPdfFontFileDefinition(
	fontFileName: string,
	postscriptName: string,
	fontFormat: LocalFontFormat
): string | [string, string] {
	return fontFormat === 'ttc' ? [fontFileName, postscriptName] : fontFileName;
}

function addPdfFontAlias(
	fontAlias: string,
	fontFileName: string,
	postscriptName: string,
	fontFormat: LocalFontFormat
) {
	const fontFileDefinition = buildPdfFontFileDefinition(fontFileName, postscriptName, fontFormat);
	pdfMake.addFonts({
		[fontAlias]: {
			normal: fontFileDefinition,
			bold: fontFileDefinition,
			italics: fontFileDefinition,
			bolditalics: fontFileDefinition,
		},
	});
}

function findCachedLocalFontByAlias(fontAlias: string):
	| {
			postscriptName: string;
			fontAlias: string;
			fontFileName: string;
			fontFormat: LocalFontFormat;
	  }
	| null {
	for (const [postscriptName, cachedFont] of localFontAliasCache.entries()) {
		if (cachedFont.fontAlias !== fontAlias) {
			continue;
		}
		return {
			postscriptName,
			...cachedFont,
		};
	}
	return null;
}

function isFontUrlReference(fontRef: unknown): boolean {
	if (typeof fontRef === 'string') {
		return true;
	}

	if (Array.isArray(fontRef)) {
		return fontRef.length > 0 && typeof fontRef[0] === 'string';
	}

	if (isRecord(fontRef) && typeof fontRef.url === 'string') {
		return true;
	}

	return false;
}

function refreshCachedLocalFontDefinitions() {
	for (const [postscriptName, cachedFont] of localFontAliasCache.entries()) {
		if (cachedFont.fontFormat !== 'ttc') {
			continue;
		}

		// TTC 定义会被 pdfmake 在渲染时就地改写，这里统一恢复成可复用配置。
		addPdfFontAlias(
			cachedFont.fontAlias,
			cachedFont.fontFileName,
			postscriptName,
			cachedFont.fontFormat
		);
	}
}

function sanitizeLocalFontDefinitions() {
	const internalPdfMake = pdfMake as PdfMakeStatic & {
		fonts?: Record<string, Record<string, unknown>>;
	};
	const allFonts = internalPdfMake.fonts;
	if (!isRecord(allFonts)) {
		return;
	}

	for (const [fontAlias, fontDef] of Object.entries(allFonts)) {
		if (!fontAlias.startsWith(`${LOCAL_FONT_ALIAS_PREFIX}_`) || !isRecord(fontDef)) {
			continue;
		}

		const normalRef = fontDef.normal;
		if (isFontUrlReference(normalRef)) {
			continue;
		}

		const cachedFont = findCachedLocalFontByAlias(fontAlias);
		if (cachedFont) {
			addPdfFontAlias(
				cachedFont.fontAlias,
				cachedFont.fontFileName,
				cachedFont.postscriptName,
				cachedFont.fontFormat
			);
			continue;
		}

		delete allFonts[fontAlias];
	}
}

async function blobToBase64(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onerror = () => reject(new Error('读取本地字体文件失败'));
		reader.onload = () => {
			if (typeof reader.result !== 'string') {
				reject(new Error('读取本地字体文件失败'));
				return;
			}
			const [, base64 = ''] = reader.result.split(',', 2);
			resolve(base64);
		};
		reader.readAsDataURL(blob);
	});
}

async function queryFontByPostscriptName(postscriptName: string): Promise<LocalFontData | null> {
	if (localFontDataCache.has(postscriptName)) {
		return localFontDataCache.get(postscriptName) ?? null;
	}

	const queryLocalFonts = getQueryLocalFonts();
	if (!queryLocalFonts) {
		return null;
	}

	const directMatch = await queryLocalFonts({ postscriptNames: [postscriptName] });
	if (directMatch.length > 0) {
		const matchedFont = directMatch[0];
		localFontDataCache.set(matchedFont.postscriptName, matchedFont);
		return matchedFont;
	}

	const allFonts = await queryLocalFonts();
	const matchedFont = allFonts.find((fontData) => fontData.postscriptName === postscriptName) ?? null;
	if (matchedFont) {
		localFontDataCache.set(matchedFont.postscriptName, matchedFont);
	}
	return matchedFont;
}

export async function getPdfMake(): Promise<PdfMakeStatic> {
	refreshCachedLocalFontDefinitions();
	sanitizeLocalFontDefinitions();
	return pdfMake;
}

export async function checkLocalFontPermission(): Promise<LocalFontPermissionState> {
	if (typeof window === 'undefined' || !window.isSecureContext || !getQueryLocalFonts()) {
		return 'unsupported';
	}

	if (!isLocalFontsAllowedByPolicy()) {
		return 'policy-blocked';
	}

	const permissionApi = navigator.permissions;
	if (!permissionApi?.query) {
		return 'prompt';
	}

	try {
		const status = await permissionApi.query({ name: 'local-fonts' as PermissionName });
		return status.state;
	} catch {
		return 'prompt';
	}
}

export async function listLocalFontOptions(): Promise<LocalFontOption[]> {
	const queryLocalFonts = getQueryLocalFonts();
	if (!queryLocalFonts) {
		return [];
	}

	const fontDataList = await queryLocalFonts();
	for (const fontData of fontDataList) {
		localFontDataCache.set(fontData.postscriptName, fontData);
	}

	const uniqueOptions = new Map<string, LocalFontOption>();
	for (const fontData of fontDataList) {
		const postscriptName = fontData.postscriptName?.trim();
		if (!postscriptName || uniqueOptions.has(postscriptName)) {
			continue;
		}

		const family = fontData.family?.trim() || postscriptName;
		const fullName = fontData.fullName?.trim() || postscriptName;
		const style = fontData.style?.trim() || 'Regular';
		uniqueOptions.set(postscriptName, {
			family,
			fullName,
			postscriptName,
			style,
			label: `${family} - ${style}`,
		});
	}

	return Array.from(uniqueOptions.values()).sort((left, right) =>
		left.label.localeCompare(right.label, 'zh-Hans-CN')
	);
}

export async function registerLocalFont(postscriptName: string): Promise<string> {
	const normalizedPostscriptName = postscriptName.trim();
	if (!normalizedPostscriptName) {
		throw new Error('字体标识不能为空');
	}

	if (localFontAliasCache.has(normalizedPostscriptName)) {
		const cachedFont = localFontAliasCache.get(normalizedPostscriptName) as {
			fontAlias: string;
			fontFileName: string;
			fontFormat: LocalFontFormat;
		};

		// pdfmake/pdfkit 会在渲染时就地修改 TTC 字体数组定义，后续渲染前需重置。
		if (cachedFont.fontFormat === 'ttc') {
			addPdfFontAlias(
				cachedFont.fontAlias,
				cachedFont.fontFileName,
				normalizedPostscriptName,
				cachedFont.fontFormat
			);
		}

		return cachedFont.fontAlias;
	}

	const permissionState = await checkLocalFontPermission();
	if (permissionState !== 'granted') {
		throw new Error('当前网站未获得本地字体访问权限，请先授权。');
	}

	const matchedFont = await queryFontByPostscriptName(normalizedPostscriptName);
	if (!matchedFont) {
		throw new Error(`未找到本地字体：${normalizedPostscriptName}`);
	}

	const fontBlob = await matchedFont.blob();
	const fontBytes = new Uint8Array(await fontBlob.arrayBuffer());
	const detectedFormat = detectLocalFontFormat(fontBytes);
	const base64Data = await blobToBase64(fontBlob);
	const fontAlias = buildLocalFontAlias(normalizedPostscriptName);
	const fontFileName = buildLocalFontFileName(normalizedPostscriptName, detectedFormat);

	try {
		pdfMake.addVirtualFileSystem({
			[fontFileName]: base64Data,
		});
		addPdfFontAlias(fontAlias, fontFileName, normalizedPostscriptName, detectedFormat);
	} catch (error: unknown) {
		const detail = error instanceof Error ? error.message : String(error);
		throw new Error(`字体加载失败（${detectedFormat}）：${detail}`);
	}

	localFontAliasCache.set(normalizedPostscriptName, {
		fontAlias,
		fontFileName,
		fontFormat: detectedFormat,
	});
	return fontAlias;
}

export function createDocDefinition(
	selectedData: CategoryDataMap,
	options: { fontName?: string } = {}
): Record<string, unknown> {
	const tableLayout = {
		hLineWidth: (index: number, node: TableLayoutNode) => {
			if (index === 0) return 1;
			if (index === node.table.body.length) return 0.8;
			return 0.5;
		},
		hLineColor: (index: number) => (index === 0 ? '#6b7280' : '#d8dee6'),
		vLineWidth: () => 0,
		paddingTop: () => 5,
		paddingBottom: () => 5,
		paddingLeft: (index: number) => (index === 0 ? 0 : 6),
		paddingRight: (index: number) => (index === 0 ? 8 : 0),
	};

	const content: Array<Record<string, unknown>> = [
		{ text: '\u4fe1\u606f\u5bfc\u51fa', style: 'title' },
		{
			text: `\u5bfc\u51fa\u65f6\u95f4\uff1a${new Date().toLocaleString()}`,
			margin: [0, 0, 0, 12],
		},
	];

	for (const [category, categoryData] of Object.entries(selectedData)) {
		const tableBody: Array<Array<Record<string, unknown>>> = [];
		for (const [key, value] of Object.entries(categoryData)) {
			tableBody.push([
				{ text: key, style: 'tableKey' },
				{ text: formatValue(value), style: 'tableValue' },
			]);
		}

		content.push({ text: category, style: 'category' });
		content.push({
			table: {
				headerRows: 0,
				widths: [140, '*'],
				body: tableBody,
			},
			layout: tableLayout,
			margin: [0, 0, 0, 10],
		});
	}

	return {
		pageMargins: [28, 30, 28, 30],
		defaultStyle: {
			font: options.fontName ?? 'Helvetica',
			fontSize: 10,
			lineHeight: 1.2,
		},
		styles: {
			title: { fontSize: 18, bold: true },
			category: { fontSize: 13, bold: true, margin: [0, 8, 0, 6] },
			tableKey: { bold: true, color: '#111827' },
			tableValue: { color: '#1f2937' },
		},
		content,
	};
}
