import type {
	CategoryDataMap,
	CategoryOrderList,
	ItemOrderByCategoryMap,
	SelectedByCategoryMap,
} from './types';

export function createAllSelectedMap(source: CategoryDataMap): SelectedByCategoryMap {
	return Object.fromEntries(
		Object.entries(source).map(([category, categoryData]) => [category, Object.keys(categoryData)])
	);
}

export function createItemOrderMap(source: CategoryDataMap): ItemOrderByCategoryMap {
	return Object.fromEntries(
		Object.entries(source).map(([category, categoryData]) => [category, Object.keys(categoryData)])
	);
}

export function createCategoryOrder(source: CategoryDataMap): CategoryOrderList {
	return Object.keys(source);
}

export function getOrderedCategories(source: CategoryDataMap, categoryOrder: CategoryOrderList): string[] {
	const rawCategories = Object.keys(source);
	const rawCategorySet = new Set(rawCategories);

	const orderedCategories = categoryOrder.filter((category) => rawCategorySet.has(category));
	const orderedCategorySet = new Set(orderedCategories);

	for (const category of rawCategories) {
		if (!orderedCategorySet.has(category)) {
			orderedCategories.push(category);
		}
	}

	return orderedCategories;
}

export function getOrderedKeys(
	category: string,
	source: CategoryDataMap,
	itemOrderByCategory: ItemOrderByCategoryMap
): string[] {
	const rawKeys = Object.keys(source[category] ?? {});
	const rawKeySet = new Set(rawKeys);

	const savedOrder = itemOrderByCategory[category] ?? [];
	const orderedKeys = savedOrder.filter((key) => rawKeySet.has(key));
	const orderedKeySet = new Set(orderedKeys);

	for (const key of rawKeys) {
		if (!orderedKeySet.has(key)) {
			orderedKeys.push(key);
		}
	}

	return orderedKeys;
}

export function isCategoryFullySelected(
	category: string,
	source: CategoryDataMap,
	selectedByCategory: SelectedByCategoryMap
): boolean {
	const allKeys = Object.keys(source[category] ?? {});
	const selected = selectedByCategory[category] ?? [];
	return allKeys.length > 0 && allKeys.length === selected.length;
}

export function buildSelectedData(
	source: CategoryDataMap,
	selectedByCategory: SelectedByCategoryMap,
	itemOrderByCategory: ItemOrderByCategoryMap,
	categoryOrder: CategoryOrderList
): CategoryDataMap {
	const pickedData: CategoryDataMap = {};

	for (const category of getOrderedCategories(source, categoryOrder)) {
		const categoryData = source[category] ?? {};
		const selectedSet = new Set(selectedByCategory[category] ?? []);
		if (selectedSet.size === 0) continue;

		const currentCategory: Record<string, unknown> = {};
		for (const key of getOrderedKeys(category, source, itemOrderByCategory)) {
			if (selectedSet.has(key)) {
				currentCategory[key] = categoryData[key];
			}
		}

		if (Object.keys(currentCategory).length > 0) {
			pickedData[category] = currentCategory;
		}
	}

	return pickedData;
}
