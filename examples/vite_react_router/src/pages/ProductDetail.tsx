import { useEffect } from "react";
import { useLoaderData, Link } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { trackEvent } from "cyanly_sdk/spa";
import { mockProducts } from "../data/products";
import type { Product } from "../data/products";

// eslint-disable-next-line react-refresh/only-export-components
export async function loader({ params }: LoaderFunctionArgs) {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 300));
  const product = mockProducts.find((p) => p.id === params.id);
  if (!product) {
    throw new Response("Product Not Found", { status: 404 });
  }
  return { product };
}

export default function ProductDetail() {
  const { product } = useLoaderData() as { product: Product };

  // Dynamically update document title to show correct metadata in Analytics
  useEffect(() => {
    document.title = `${product.name} | Chiyo Store`;
  }, [product]);

  return (
    <div className="detail-container">
      {/* Back button */}
      <Link to="/products" className="back-link">
        &larr; Back to catalog
      </Link>

      <div className="detail-grid">
        {/* Product preview panel (gradient block) */}
        <div
          className="detail-image"
          style={{ background: product.imageUrl }}
        />

        {/* Specs & Buy Panel */}
        <div className="detail-info">
          <div className="detail-title-section">
            <div>
              <span className="rating-badge">
                ★ {product.rating} ({product.reviewsCount} reviews)
              </span>
            </div>
            <h1 className="detail-title">{product.name}</h1>
            <p className="detail-price">${product.price}</p>
          </div>

          <p
            style={{
              fontSize: "0.875rem",
              lineHeight: "1.6",
              color: "var(--text-muted)",
            }}
          >
            {product.description}
          </p>

          {/* Specs list */}
          <div className="detail-specs">
            <h3 className="specs-title">Technical Specifications</h3>
            <ul className="spec-list">
              {product.specs.map((spec, index) => (
                <li key={index} className="spec-item">
                  <span className="spec-dot" />
                  {spec}
                </li>
              ))}
            </ul>
          </div>

          {/* Action button */}
          <div
            style={{
              paddingTop: "1rem",
              borderTop: "1px solid var(--border-color)",
            }}
          >
            <button
              className="add-to-cart-btn"
              onClick={() =>
                trackEvent("add_to_cart", {
                  product_id: product.id,
                  product_name: product.name,
                  price: product.price,
                })
              }
            >
              Add to cart
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
