type SearchableModel = {
  name: string;
  fullName: string;
  modelId: string;
};

type SearchableGroup<Model extends SearchableModel> = {
  provider: { name: string };
  models: Model[];
};

/**
 * Filters model groups by a whitespace-separated query. Every term must match
 * the model name, id, or provider name (case-insensitive).
 */
export function filterModelGroups<
  Model extends SearchableModel,
  Group extends SearchableGroup<Model>,
>(groups: Group[], query: string): Group[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return groups;

  return groups.flatMap((group) => {
    const models = group.models.filter((model) => {
      const haystack =
        `${model.fullName} ${model.name} ${model.modelId} ${group.provider.name}`.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
    return models.length > 0 ? [{ ...group, models }] : [];
  });
}
