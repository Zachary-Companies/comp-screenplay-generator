import { DataView } from './DataView';
const sdk = (window as any).__WoodburyViewSDK;
sdk.registerReactView({ name: 'data', component: DataView });
