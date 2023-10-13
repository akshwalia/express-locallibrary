const asyncHandler = require("express-async-handler");

const Book = require('../models/book');
const Author = require('../models/author');
const BookInstance = require('../models/bookinstance');
const Genre = require('../models/genre');

const { body, validationResult } = require("express-validator");

exports.index = asyncHandler(async (req, res, next) => {
  // Get details of books, book instances, authors and genre counts (in parallel)
  const [
    numBooks,
    numBookInstances,
    numAvailableBookInstances,
    numAuthors,
    numGenres,
  ] = await Promise.all([
    Book.countDocuments({}).exec(),
    BookInstance.countDocuments({}).exec(),
    BookInstance.countDocuments({ status: "Available" }).exec(),
    Author.countDocuments({}).exec(),
    Genre.countDocuments({}).exec(),
  ]);

  res.render("index", {
    title: "Local Library Home",
    book_count: numBooks,
    book_instance_count: numBookInstances,
    book_instance_available_count: numAvailableBookInstances,
    author_count: numAuthors,
    genre_count: numGenres,
  });
});

// Display list of all books.
exports.book_list = asyncHandler(async (req, res, next) => {
  const allBooks = await Book.find({}, "title author")
    .sort({ title: 1 })
    .populate("author")
    .exec();

  res.render("book_list", { title: "Book List", book_list: allBooks });
});

// Display detail page for a specific book.
exports.book_detail = asyncHandler(async (req, res, next) => {
  const [book, bookinstances] = await Promise.all([Book.findById(req.params.id).populate("genre").populate("author").exec(), BookInstance.find({book: req.params.id})]);
  
  if(book === null) {
    const err = new Error("Book Not Found");
    err.status = 404;

    return next(err);
  }

  
  res.render('book_details', {book: book, bookinstances: bookinstances});
});

// Display book create form on GET.
exports.book_create_get = asyncHandler(async (req, res, next) => {
  const [allGenres, allAuthors] = await Promise.all([Genre.find().exec(), Author.find().exec()]);
  res.render('book_form',{title: 'Create Book', authors: allAuthors, genres: allGenres })
});

// Handle book create on POST.
exports.book_create_post = [
  (req, res, next) => {
    if (!(req.body.genre instanceof Array)) {
      if (typeof req.body.genre === "undefined") req.body.genre = [];
      else req.body.genre = new Array(req.body.genre);
    }
    next();
  },
  body('title').trim().isLength({min: 1}).escape().withMessage("Title of the book must be specified"),
  body("author", "Author must not be empty.").trim().isLength({ min: 1 }).escape(),
  body('summary').trim().isLength({min: 10}).escape().withMessage("Summary must be atleast 10 chacacter long"),
  body("isbn", "ISBN must not be empty").trim().isLength({ min: 1 }).escape(),
  body("genre.*").escape(),
  asyncHandler(async (req, res, next) => {
    const errors = validationResult(req);

    const book = new Book({
      title: req.body.title,
      author: req.body.author,
      summary: req.body.summary,
      isbn: req.body.isbn,
      genre: req.body.genre
    })

    if(!errors.isEmpty()) {
      const [allGenres, allAuthors] = await Promise.all([Genre.find().exec(), Author.find().exec()]);

      for (const genre of allGenres) {
        if (book.genre.includes(genre._id)) {
          genre.checked = "true";
        }
      }

      res.render('book_form',{title: 'Create Book', authors: allAuthors, genres: allGenres, book: book, errors: errors.array() })
    }
    else {
      await book.save();

      res.redirect(book.url);
    }
})
];

// Display book delete form on GET.
exports.book_delete_get = asyncHandler(async (req, res, next) => {
  const [book, allBookInstances] = await Promise.all([
    Book.findById(req.params.id).exec(),
    BookInstance.find({book: req.params.id}).exec()
  ]);

  if(book==null) {
    res.redirect('catalog/books');
  }

  res.render('book_delete', {book: book, instances: allBookInstances});
});

// Handle book delete on POST.
exports.book_delete_post = asyncHandler(async (req, res, next) => {
  const [book, allBookInstances] = await Promise.all([
    Book.findById(req.params.id).exec(),
    BookInstance.find({book: req.params.id}).exec()
  ]);

  if(allBookInstances.length>0) {
    res.render('book_delete', {book: book, instances: allBookInstances});
  }
  else {
    await Book.findByIdAndDelete(req.params.id);
    res.redirect('/catalog/books');
  }

});

// Display book update form on GET.
exports.book_update_get = asyncHandler(async (req, res, next) => {
  const [book, allAuthors, allGenres] = await Promise.all([
    Book.findById(req.params.id).exec(),
    Author.find().exec(),
    Genre.find().exec()
  ]);

  if(book==null) {
    const err = new Error("Book not found");

    err.status = 404;

    return next(err);
  }

  for (const genre of allGenres) {
    for (const book_g of book.genre) {
      if (genre._id.toString() === book_g._id.toString()) {
        genre.checked = "true";
      }
    }
  }

  res.render('book_form', {title: "Update Book", book: book, authors: allAuthors, genres: allGenres})
});

// Handle book update on POST.
exports.book_update_post = [
  (req, res, next) => {
    if (!(req.body.genre instanceof Array)) {
      if (typeof req.body.genre === "undefined") 
        req.body.genre = [];
      else 
        req.body.genre = new Array(req.body.genre);
    }
    next();
  },
  body('title').trim().isLength({min: 1}).escape().withMessage("Title of the book must be specified"),
  body("author", "Author must not be empty.").trim().isLength({ min: 1 }).escape(),
  body('summary').trim().isLength({min: 10}).escape().withMessage("Summary must be atleast 10 chacacter long"),
  body("isbn", "ISBN must not be empty").trim().isLength({ min: 1 }).escape(),
  body("genre.*").escape(),
  asyncHandler(async (req, res, next) => {
    const errors = validationResult(req);

    const book = new Book({
      title: req.body.title,
      author: req.body.author,
      summary: req.body.summary,
      isbn: req.body.isbn,
      genre: typeof req.body.genre === "undefined" ? [] : req.body.genre,
      _id: req.params.id, // This is required, or a new ID will be assigned!
    });

    if (!errors.isEmpty()) {
      // There are errors. Render form again with sanitized values/error messages.

      // Get all authors and genres for form
      const [allAuthors, allGenres] = await Promise.all([
        Author.find().exec(),
        Genre.find().exec(),
      ]);

      // Mark our selected genres as checked.
      for (const genre of allGenres) {
        if (book.genre.indexOf(genre._id) > -1) {
          genre.checked = "true";
        }
      }
      res.render("book_form", {
        title: "Update Book",
        authors: allAuthors,
        genres: allGenres,
        book: book,
        errors: errors.array(),
      });
      return;
    }
    else {
      // Data from form is valid. Update the record.
      const updatedBook = await Book.findByIdAndUpdate(req.params.id, book, {});
      // Redirect to book detail page.
      res.redirect(updatedBook.url);
    }
})
];
