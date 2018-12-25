# Kopie

Simple scaffolding utility using Handlebars for compiling templates.

## Installing

```sh
npm install kopie -g
```

## Usage

Use <code>generate, gen or g</code> to generate a template. Generate requires a name, shown below as **page** and an output path, shown below as **output/directory**. 

In your .kopie/config.json file you can configure your **root** directory where generators will output to. You can also specify in the generator's config a **base** sub directory from the above root.

Behind the scenes Kopie does the following <code>join(root, base, output)</code> where **output** is shown below as **output/directory**.

```sh
ko generate page output/directory --props.key=value
```

## Templates

If you've used Handlebars or really just about any templating engine you should be right at home. Any valid Handlebars or Handlebars-Helpers configuration works.

Consider the following template named **demo**

```hbs
<p>Hello my name is {{capitalize name}}</p>
```

Using command <code>ko g demo demo --props.name='Milton Waddams'</code>

```html
<p>Hello my name is Milton Waddams</p>
```

You can define required arguments, options and props for your generator. You can also defined defaults. Here's an example below.

Here below **dest** within required.args ensures that you provide a destination path. Consider this command <code>ko g page components/login</code>. The below config demands **components/login** be provided or an error will be thrown.

```json
"page": {
  "name": "page",
  "isDirectory": true,
  "action": "default",
  "base": "pages",
  "defaults": {
    "args": [],
    "props": {
      "name": "MyComponent"
    }
  },
  "required": {
    "args": [
      "dest"
    ],
    "props": [
      "name"
    ]
  }
}
```



