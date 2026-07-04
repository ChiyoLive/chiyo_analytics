import { createBrowserRouter } from "react-router";
import RootLayout from "./layouts/RootLayout";
import Home from "./pages/Home";
import Products, { loader as productsLoader } from "./pages/Products";
import ProductDetail, {
  loader as productDetailLoader,
} from "./pages/ProductDetail";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      {
        index: true,
        element: <Home />,
      },
      {
        path: "products",
        element: <Products />,
        loader: productsLoader,
      },
      {
        path: "products/:id",
        element: <ProductDetail />,
        loader: productDetailLoader,
      },
    ],
  },
]);
