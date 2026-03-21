/**
 * SDK shim — resolves PipelineProvider/ImageZoom imports at runtime
 * from the host app's window.__WoodburyViewSDK global.
 * React imports are handled by the esbuild externals plugin.
 */
const SDK = (window as any).__WoodburyViewSDK as any;

export const usePipeline = SDK.usePipeline;
export const usePipelineIdentity = SDK.usePipelineIdentity;
export const useProjectData = SDK.useProjectData;
export const useAIOperations = SDK.useAIOperations;
export const ImageZoom = SDK.ImageZoom;
export const PipelineProvider = SDK.PipelineProvider;

// Types — using `any` for now; type safety comes from a future @woodbury/view-sdk package
export type Character = any;
export type Location = any;
export type SceneData = any;
export type SceneShot = any;
export type SceneDialogue = any;
export type PrevisGeneration = any;
export type Element = any;
export type ProjectData = any;
