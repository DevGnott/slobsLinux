import { Services } from 'components-react/service-provider';
import { alertAsync, confirmAsync } from 'components-react/modals';
import { $t } from 'services/i18n';

/**
 * Asks to create a copy of a scene collection of another operating system for
 * the current one, creates it and tells what was changed on the way.
 * @returns The id of the new collection, or undefined if nothing was imported
 */
export async function importSceneCollectionCopy(
  id: string,
  options: { confirm?: boolean } = {},
): Promise<string | undefined> {
  const { SceneCollectionsService } = Services;
  const collection = SceneCollectionsService.getCollection(id);
  if (!collection) return;

  if (options.confirm) {
    const confirmed = await confirmAsync(
      $t(
        '"%{name}" was created on another operating system. Do you want to import a copy for this system? The original is not changed.',
        { name: collection.name },
      ),
    );
    if (!confirmed) return;
  }

  try {
    const result = await SceneCollectionsService.actions.return.importFromOtherOS(id);
    if (!result) return;

    const { replaced, removed, removedFilters } = result.report;
    const lines = [
      $t('Created "%{name}". The original collection was not changed.', { name: result.name }),
      replaced.length
        ? $t('%{count} sources were replaced by their Linux equivalent. Pick the devices again.', {
            count: replaced.length,
          })
        : '',
      removed.length
        ? $t('%{count} sources are not available on Linux and were removed: %{names}', {
            count: removed.length,
            names: removed.map(s => s.name).join(', '),
          })
        : '',
      removedFilters.length
        ? $t('%{count} filters were removed.', { count: removedFilters.length })
        : '',
    ].filter(Boolean);

    await alertAsync(lines.join('\n\n'));
    return result.id;
  } catch (e: unknown) {
    console.error('Scene collection import failed', e);
    await alertAsync($t('The scene collection could not be imported.'));
  }
}
