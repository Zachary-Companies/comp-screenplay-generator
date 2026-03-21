import { VoicesView } from './VoicesView';
const sdk = (window as any).__WoodburyViewSDK;
sdk.registerReactView({ name: 'voices', component: VoicesView });
