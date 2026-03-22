# View Data Providers — Pattern Guide

## Why Providers

When pipeline views let users **create, update, or delete** data (characters, locations, versions, etc.), the state management should live in a React context provider — not scattered across individual components.

Without a provider, each component independently:
- Calls `fetch()` to API endpoints
- Manages its own loading/error state
- Calls `reload()` to refresh data
- Has no visibility into what sibling components are doing

This leads to:
- **Race conditions** — two components saving at the same time can overwrite each other
- **Stale state** — component A updates data but component B still shows the old version
- **Duplicated logic** — every card has the same fetch/error/reload boilerplate
- **No coordination** — can't show "3 of 12 generating" progress across cards

## The Pattern

### 1. Create a context with typed operations

```tsx
// CharacterImageContext.tsx
interface CharacterImageContextValue {
  generatingIds: Record<string, boolean>;
  regenerate: (characterId: string, character: any) => Promise<void>;
  selectVersion: (characterId: string, version: number) => Promise<void>;
}

const CharacterImageContext = createContext<CharacterImageContextValue | null>(null);
```

### 2. Provider manages all API calls and state

```tsx
export function CharacterImageProvider({ children }) {
  const { pipelineId, reload } = usePipeline();
  const [generatingIds, setGeneratingIds] = useState({});

  const regenerate = useCallback(async (characterId, character) => {
    setGeneratingIds(prev => ({ ...prev, [characterId]: true }));
    try {
      await fetch(`/api/app/${pipelineId}/generate-character-headshot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId, character }),
      });
      await reload(); // Single coordinated reload
    } finally {
      setGeneratingIds(prev => ({ ...prev, [characterId]: false }));
    }
  }, [pipelineId, reload]);

  return (
    <CharacterImageContext.Provider value={{ generatingIds, regenerate, selectVersion }}>
      {children}
    </CharacterImageContext.Provider>
  );
}
```

### 3. Components consume via hook

```tsx
export function CharacterCard({ character }) {
  const { generatingIds, regenerate } = useCharacterImages();
  const isGenerating = generatingIds[character.id];

  // No fetch, no reload, no local generating state — just call the operation
  const handleRegen = () => regenerate(character.id, character);
}
```

### 4. Wrap at the view level

```tsx
export function DataView() {
  return (
    <CharacterImageProvider>
      <DataViewInner />
    </CharacterImageProvider>
  );
}
```

## When to Use a Provider

| Scenario | Provider? | Why |
|----------|-----------|-----|
| Read-only display | No | `usePipeline()` is enough |
| Single action button (e.g. "Generate All") | No | One component owns the action |
| Per-item mutations (edit, regen, delete) | **Yes** | Multiple components need shared state |
| Cross-component coordination (progress) | **Yes** | Need visibility across siblings |
| Optimistic updates | **Yes** | Central state can rollback consistently |

## Key Principles

1. **Provider owns the API calls.** Components never call `fetch()` directly for mutations. They call provider methods which handle the request, error handling, and data refresh.

2. **Provider owns the reload.** After any mutation, the provider calls `reload()` once. This prevents multiple simultaneous reloads when several components act in sequence.

3. **Send client data with mutations.** The client's state is the source of truth for what the user sees. Always send the current entity data with mutation requests so the server uses the user's latest edits, not potentially stale in-memory state:
   ```tsx
   regenerate(character.id, character) // sends full character object
   ```

4. **Server only writes what it owns.** When the server processes a mutation (e.g., image generation), it should only update the fields it's responsible for (`imagePath`, `imageVersions`). It should never overwrite user-editable fields (`description`, `name`, `traits`) that the client is the authority on.

5. **Track per-entity state.** Use a `Record<string, boolean>` (or similar) for tracking which entities are in-progress. This lets every card show its own loading state without prop drilling.

## Current Providers in This Pipeline

### CharacterImageContext
- **File:** `views/data/CharacterImageContext.tsx`
- **Operations:** `regenerate(characterId, character)`, `selectVersion(characterId, version)`
- **State:** `generatingIds` — which characters are currently generating
- **Used by:** `CharacterCard` via `useCharacterImages()` hook
- **Wrapped in:** `DataView`

## Adding a New Provider

For example, to add character CRUD (create/delete):

1. Create `views/data/CharacterCrudContext.tsx`
2. Define operations: `createCharacter(data)`, `deleteCharacter(id)`, `reorderCharacters(ids)`
3. Track state: `deletingIds`, `creating`
4. Server endpoints: `POST /create-character`, `DELETE /delete-character`
5. Wrap in `DataView` alongside `CharacterImageProvider`
6. Consume in components via `useCharacterCrud()` hook
