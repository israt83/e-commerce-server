const express = require("express");
const app = express();
const jwt = require("jsonwebtoken");
const cors = require("cors");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 5001;

const corsOptions = {
  origin: ["http://localhost:5173" , "https://luxebeautys.netlify.app"],

  credentials: true,
  optionSuccessStatus: 200,
};
app.use(cors(corsOptions));



const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.nghfy93.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const userCollection = client.db("onlineCosmetic").collection("users");
    const productCollection = client.db("onlineCosmetic").collection("product");
    const reviewsCollection = client.db("onlineCosmetic").collection("reviews");
    const cartCollection = client.db("onlineCosmetic").collection("carts");
    const paymentsCollection = client
      .db("onlineCosmetic")
      .collection("payments");

    // jwt api
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "365d",
      });
      res.send({ token });
    });

    // middlewares
    const verifyToken = (req, res, next) => {
      // console.log("inside verifyToken", req.headers.authorization);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "unauthorized access" });
      }
      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "forbidden access" });
        }
        req.decoded = decoded;
        next();
      });
    };

    // Verify admin token
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

  
    // user related api
    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    app.get("/users/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }

      const query = { email: email };
      const user = await userCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user.role === "admin";
      }
      res.send({ admin });
    });

    app.post("/users", async (req, res) => {
      const user = req.body;

      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "user already existing", insertedId: null });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    app.patch(
      "/users/admin/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            role: "admin",
          },
        };
        const result = await userCollection.updateOne(filter, updateDoc);
        res.send(result);
      }
    );

    app.delete("/users/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(query);
      res.send(result);
    });

    // product api
    app.get("/product", async (req, res) => {
      const result = await productCollection.find().toArray();
      res.send(result);
    });

    // search products

    app.get("/products", async (req, res) => {
      const search = req.query.query || "";

      const query = {
        $or: [
          { name: { $regex: search, $options: "i" } }, // product name match
          { category: { $regex: search, $options: "i" } }, // category match
        ],
      };

      try {
        const products = await productCollection.find(query).toArray();
        res.json(products);
      } catch (err) {
        res.status(500).json({ message: "Server error" });
      }
    });

    app.get("/product/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await productCollection.findOne(query);
      res.send(result);
    });

    app.post("/product", verifyToken, verifyAdmin, async (req, res) => {
      const item = req.body;
      const result = await productCollection.insertOne(item);
      res.send(result);
    });

    app.patch("/product/:id", async (req, res) => {
      const item = req.body;
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          name: item.name,
          gender: item.gender,
          category: item.category,
          price: item.price,
          brand: item.brand,
          description: item.description,
          image: item.image,
        },
      };
      const result = await productCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.delete("/product/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await productCollection.deleteOne(query);
      res.send(result);
    });

    app.get("/reviews", async (req, res) => {
      const result = await reviewsCollection.find().toArray();
      res.send(result);
    });

    //  Add a Review
    app.post("/reviews", async (req, res) => {
      const review = req.body;
      const result = await reviewsCollection.insertOne(review);
      res.send(result);
    });

    //  Get Reviews by ProductId
    app.get("/reviews/:productId", async (req, res) => {
      const productId = req.params.productId;
      const reviews = await reviewsCollection
        .find({ productId: productId })
        .sort({ date: -1 })
        .toArray();
      res.send(reviews);
    });
    // Update review
    app.put("/reviews/:id", async (req, res) => {
      const id = req.params.id;
      const updatedReview = req.body;
      const result = await reviewsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { review: updatedReview.review, date: new Date() } }
      );
      res.send(result);
    });

    // Delete review
    app.delete("/reviews/:id", async (req, res) => {
      const id = req.params.id;
      const result = await reviewsCollection.deleteOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });
    // carts collection
    app.get("/carts", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await cartCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/carts", async (req, res) => {
      const cartItem = req.body;
      const result = await cartCollection.insertOne(cartItem);
      res.send(result);
    });

    app.delete("/carts/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await cartCollection.deleteOne(query);
      res.send(result);
    });
    // payment Intent

    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.get("/payments/:email", verifyToken, async (req, res) => {
      const query = { email: req.params.email };
      if (req.params.email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const result = await paymentsCollection.find(query).toArray();
      res.send(result);
    });

    // payments
    app.post("/payments", async (req, res) => {
      const payment = req.body;

      // Check if cartIds exists and is an array
      if (!payment.cartIds || !Array.isArray(payment.cartIds)) {
        return res
          .status(400)
          .send({ error: "cartIds is missing or is not an array" });
      }

      // Insert payment data into the database
      const paymentResult = await paymentsCollection.insertOne(payment);
      console.log("paymentInfo", payment);

      // Create a query to delete the items from the cart
      const query = {
        _id: {
          $in: payment.cartIds.map((id) => new ObjectId(id)),
        },
      };

      // Delete cart items
      const deleteResult = await cartCollection.deleteMany(query);
      res.send({ paymentResult, deleteResult });
    });

    // stats or analytics

    app.get("/admin-stats", verifyToken, verifyAdmin, async (req, res) => {
      const users = await userCollection.estimatedDocumentCount();
      const productItems = await productCollection.estimatedDocumentCount();
      const orders = await paymentsCollection.estimatedDocumentCount();

      const result = await paymentsCollection
        .aggregate([
          {
            $group: {
              _id: null,
              totalRevenue: {
                $sum: "$price",
              },
            },
          },
        ])
        .toArray();
      const revenue = result.length > 0 ? result[0].totalRevenue : 0;

      res.send({
        users,
        productItems,
        orders,
        revenue,
      });
    });

    app.get("/order-stats", async (req, res) => {
      try {
        const result = await paymentsCollection
          .aggregate([
            { $unwind: "$productItemIds" },
            {
              $addFields: {
                productItemIds: { $toObjectId: "$productItemIds" },
              },
            },
            {
              $lookup: {
                from: "product",
                localField: "productItemIds",
                foreignField: "_id",
                as: "productItems",
              },
            },
            { $unwind: "$productItems" },
            {
              $group: {
                _id: "$productItems.category",
                quantity: { $sum: 1 },
                revenue: {
                  $sum: {
                    $convert: {
                      input: "$productItems.price",
                      to: "double",
                      onError: 0,
                      onNull: 0,
                    },
                  },
                },
              },
            },
            {
              $project: {
                _id: 0,
                category: "$_id",
                quantity: 1,
                revenue: 1,
              },
            },
          ])
          .toArray();

        res.send(result);
      } catch (error) {
        console.error("order-stats error:", error);
        res.status(500).send({ message: "Failed to fetch order stats", error });
      }
    });
    // Get all bookings
    app.get("/manage-bookings", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const bookings = await paymentsCollection
          .find({})
          .sort({ date: -1 }) // latest first
          .toArray();
        res.send(bookings);
      } catch (error) {
        console.error("Error fetching bookings:", error);
        res.status(500).send({ message: "Failed to fetch bookings" });
      }
    });

    // Update booking status
    app.patch(
      "/manage-bookings/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const id = req.params.id;
          const { status } = req.body; // pending, confirmed, completed, canceled
          const result = await paymentsCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { status } }
          );
          res.send({ success: !!result.modifiedCount, status });
        } catch (error) {
          console.error("Error updating booking status:", error);
          res.status(500).send({ message: "Failed to update booking status" });
        }
      }
    );

    // Delete booking
    app.delete(
      "/manage-bookings/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const id = req.params.id;
          const result = await paymentsCollection.deleteOne({
            _id: new ObjectId(id),
          });
          res.send({ success: !!result.deletedCount });
        } catch (error) {
          console.error("Error deleting booking:", error);
          res.status(500).send({ message: "Failed to delete booking" });
        }
      }
    );

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

// middleware
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("online cosmeting shop running");
});

app.listen(port, () => {
  console.log(`Online cosmeting shop running on port ${port}`);
});
