import { EditorView } from './EditorView';
const sdk = (window as any).__WoodburyViewSDK;
sdk.registerReactView({ name: 'editor', component: EditorView });
