declare module '*.vue' {
	import type { DefineComponent } from 'vue';
	const component: DefineComponent<{}, {}, any>;
	export default component;
}

interface ImportMetaEnv {
	readonly BASE_URL: string;
	[key: string]: string | undefined;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}

declare module 'pdfmake/build/pdfmake' {
	type PdfVfsEntry = string | { data: string; encoding?: string };
	type PdfFontFile = string | [string, string];
	type PdfFontDefinition = {
		normal: PdfFontFile;
		bold: PdfFontFile;
		italics: PdfFontFile;
		bolditalics: PdfFontFile;
	};

	interface PdfDocument {
		getBlob(): Promise<Blob>;
		getDataUrl(): Promise<string>;
		download(filename?: string): Promise<void>;
		open(win?: Window | null): Promise<void>;
	}

	interface PdfMakeStatic {
		createPdf(
			docDefinition: Record<string, unknown>,
			options?: Record<string, unknown>
		): PdfDocument;
		addVirtualFileSystem(vfs: Record<string, PdfVfsEntry>): void;
		addFonts(fonts: Record<string, PdfFontDefinition>): void;
	}

	const pdfMake: PdfMakeStatic;
	export default pdfMake;
}