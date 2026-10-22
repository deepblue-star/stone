// @vitest-environment happy-dom
import { mount, flushPromises } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { expect, it } from 'vitest';
import type { DefineComponent } from 'vue';
import MerchantSidebar from '../../admin-web/src/components/MerchantSidebar.vue';
const TypedSidebar = MerchantSidebar as unknown as DefineComponent<{ active: 'orders' | 'settings'; busy?: boolean }>;

it('blocks brand and navigation activation while busy, including keyboard-generated clicks', async () => {
  const router = createRouter({ history: createMemoryHistory(), routes: ['/orders', '/settings', '/catalog', '/'].map(path => ({ path, component: { template: '<div />' } })) });
  await router.push('/orders'); await router.isReady();
  const wrapper = mount(TypedSidebar, { props: { active: 'orders', busy: true }, global: { plugins: [router] } });
  const settings = wrapper.findAll('a').find(link => link.text().includes('站点配置'))!;
  await settings.trigger('click'); await flushPromises();
  expect(router.currentRoute.value.path).toBe('/orders');
  await wrapper.find('.brand-lockup').trigger('click'); await flushPromises();
  expect(router.currentRoute.value.path).toBe('/orders');
  await wrapper.setProps({ busy: false });
  await wrapper.findAll('a').find(link => link.text().includes('站点配置'))!.trigger('click'); await flushPromises();
  expect(router.currentRoute.value.path).toBe('/settings');
  wrapper.unmount();
});
