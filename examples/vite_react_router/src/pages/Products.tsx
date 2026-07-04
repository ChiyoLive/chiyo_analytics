import { useEffect } from "react";
import { useLoaderData, Link } from "react-router";
import { mockProducts } from "../data/products";
import type { Product } from "../data/products";

export async function loader() {
  // Simulate network delay to showcase loader capabilities
  await new Promise((resolve) => setTimeout(resolve, 400));
  return { products: mockProducts };
}

export default function Products() {
  const { products } = useLoaderData() as { products: Product[] };

  useEffect(() => {
    document.title = "Gadget Catalog | Chiyo Store";
  }, []);

  return (
    <div>
      <div className="catalog-header">
        <h1 className="catalog-title">Premium Gadget Catalog</h1>
        <p className="catalog-subtitle">
          Click any product to inspect details. Each navigation triggers client-side pageview beacons.
        </p>
      </div>

      {/* Product Grid */}
      <div className="product-grid">
        {products.map((product) => (
          <Link
            to={`/products/${product.id}`}
            key={product.id}
            className="product-card"
          >
            {/* Product Image (gorgeous CSS gradients) */}
            <div
              className="product-image"
              style={{ background: product.imageUrl }}
            />

            {/* Product Meta */}
            <div className="product-info">
              <div className="product-meta">
                <span className="rating-badge">
                  ★ {product.rating} ({product.reviewsCount})
                </span>
                <span className="price-tag">
                  ${product.price}
                </span>
              </div>

              <h2 className="product-name">
                {product.name}
              </h2>

              <p className="product-desc">
                {product.description}
              </p>

              <div style={{ marginTop: "auto" }}>
                <span className="inspect-button">
                  Inspect specs &rarr;
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
