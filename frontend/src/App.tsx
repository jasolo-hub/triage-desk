import { Authenticated, Refine } from "@refinedev/core";
import {
  AuthPage,
  ErrorComponent,
  ThemedLayout,
  useNotificationProvider,
} from "@refinedev/antd";
import "@refinedev/antd/dist/reset.css";

import {
  CustomerServiceOutlined,
  TagsOutlined,
  TeamOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { App as AntdApp } from "antd";
import { BrowserRouter, Outlet, Route, Routes } from "react-router";
import routerProvider, {
  CatchAllNavigate,
  DocumentTitleHandler,
  NavigateToResource,
  UnsavedChangesNotifier,
} from "@refinedev/react-router";

import { Header } from "./components/header";
import { ColorModeContextProvider } from "./contexts/color-mode";
import { CustomerCreate, CustomerEdit, CustomerList, CustomerShow } from "./pages/customers";
import { TagList } from "./pages/tags";
import { TicketCreate, TicketEdit, TicketList, TicketShow } from "./pages/tickets";
import { UserCreate, UserEdit, UserList } from "./pages/users";
import { accessControlProvider } from "./providers/accessControlProvider";
import { authProvider } from "./providers/authProvider";
import dataProvider from "./providers/dataProvider";
import { queryClient } from "./providers/queryClient";

function App() {
  return (
    <BrowserRouter>
      <ColorModeContextProvider>
        <AntdApp>
          <Refine
            dataProvider={dataProvider}
            authProvider={authProvider}
            accessControlProvider={accessControlProvider}
            notificationProvider={useNotificationProvider}
            routerProvider={routerProvider}
            // Resource names = API paths = Casbin resources, so one string
            // drives the URL, the data call and the permission lookup.
            resources={[
              {
                name: "tickets",
                list: "/tickets",
                create: "/tickets/create",
                edit: "/tickets/edit/:id",
                show: "/tickets/show/:id",
                meta: { canDelete: true, icon: <CustomerServiceOutlined /> },
              },
              {
                name: "customers",
                list: "/customers",
                create: "/customers/create",
                edit: "/customers/edit/:id",
                show: "/customers/show/:id",
                meta: { canDelete: true, icon: <TeamOutlined /> },
              },
              {
                name: "tags",
                list: "/tags", // create/edit happen inline in the list (F9)
                meta: { icon: <TagsOutlined /> },
              },
              {
                name: "users",
                list: "/users",
                create: "/users/create",
                edit: "/users/edit/:id",
                meta: { canDelete: true, icon: <UserOutlined /> },
              },
              {
                // Data-only resource for assignee selects (D15): no routes,
                // not in the menu, but useSelect({ resource: "agents" }) works.
                name: "agents",
                meta: { hide: true },
              },
            ]}
            options={{
              syncWithLocation: true, // filters/sort/page live in the URL (shareable, survive reload)
              warnWhenUnsavedChanges: true,
              disableTelemetry: true,
              title: { text: "Triage Desk", icon: <CustomerServiceOutlined /> }, // used by sider + AuthPage
              reactQuery: { clientConfig: queryClient }, // see providers/queryClient.ts
            }}
          >
            <Routes>
              <Route
                element={
                  <Authenticated
                    key="authenticated-routes"
                    fallback={<CatchAllNavigate to="/login" />} // keeps ?to= so login returns here
                  >
                    <ThemedLayout Header={() => <Header sticky />}>
                      <Outlet />
                    </ThemedLayout>
                  </Authenticated>
                }
              >
                <Route index element={<NavigateToResource resource="tickets" />} />
                <Route path="/tickets">
                  <Route index element={<TicketList />} />
                  <Route path="create" element={<TicketCreate />} />
                  <Route path="edit/:id" element={<TicketEdit />} />
                  <Route path="show/:id" element={<TicketShow />} />
                </Route>
                <Route path="/customers">
                  <Route index element={<CustomerList />} />
                  <Route path="create" element={<CustomerCreate />} />
                  <Route path="edit/:id" element={<CustomerEdit />} />
                  <Route path="show/:id" element={<CustomerShow />} />
                </Route>
                <Route path="/tags" element={<TagList />} />
                <Route path="/users">
                  <Route index element={<UserList />} />
                  <Route path="create" element={<UserCreate />} />
                  <Route path="edit/:id" element={<UserEdit />} />
                </Route>
                <Route path="*" element={<ErrorComponent />} />
              </Route>

              <Route
                element={
                  // Already logged in? /login bounces to the app instead.
                  <Authenticated key="auth-pages" fallback={<Outlet />}>
                    <NavigateToResource resource="tickets" />
                  </Authenticated>
                }
              >
                <Route
                  path="/login"
                  element={
                    // Accounts are created by an ADMIN (Users page), so no
                    // self-registration / password reset / "remember me".
                    <AuthPage
                      type="login"
                      registerLink={false}
                      forgotPasswordLink={false}
                      rememberMe={false}
                    />
                  }
                />
              </Route>
            </Routes>

            <UnsavedChangesNotifier />
            <DocumentTitleHandler
              // default suffix is " | Refine"
              handler={({ autoGeneratedTitle }) =>
                autoGeneratedTitle.replace(/Refine$/, "Triage Desk")
              }
            />
          </Refine>
        </AntdApp>
      </ColorModeContextProvider>
    </BrowserRouter>
  );
}

export default App;
