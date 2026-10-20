/** Root tsc checks test imports; vue-tsc separately checks full SFC implementations. */
declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent;
  export default component;
}
