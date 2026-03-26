import { ExportView } from './ExportView';
const sdk = (window as any).__WoodburyViewSDK;
sdk.registerReactView({ name: 'export', component: ExportView });
