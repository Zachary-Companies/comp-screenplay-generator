import { OverviewView } from './OverviewView';
const sdk = (window as any).__WoodburyViewSDK;
sdk.registerReactView({ name: 'overview', component: OverviewView });
