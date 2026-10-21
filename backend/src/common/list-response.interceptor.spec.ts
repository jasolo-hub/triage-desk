import { lastValueFrom, of } from 'rxjs';
import { ListResponseInterceptor } from './list-response.interceptor.js';

// The interceptor is the one place that turns `{ items, total }` into
// "array body + x-total-count header" for Refine's simple-rest provider.
describe('ListResponseInterceptor', () => {
  it('sets x-total-count and returns the items as the body', async () => {
    const setHeader = vi.fn();
    const context = {
      switchToHttp: () => ({ getResponse: () => ({ setHeader }) }),
    } as never;
    const next = {
      handle: () => of({ items: [{ id: 1 }, { id: 2 }], total: 5000 }),
    };

    const body = await lastValueFrom(
      new ListResponseInterceptor().intercept(context, next),
    );

    expect(body).toEqual([{ id: 1 }, { id: 2 }]);
    expect(setHeader).toHaveBeenCalledWith('x-total-count', 5000);
  });
});
