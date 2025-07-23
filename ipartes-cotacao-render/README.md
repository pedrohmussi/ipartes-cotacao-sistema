# Sistema de Cotação IPARTES

Sistema completo para busca de fornecedores e geração de emails de cotação com persistência de dados no MongoDB Atlas.

## Funcionalidades

- 🔍 **Busca inteligente de fornecedores** - Utiliza ChatGPT para encontrar fornecedores específicos
- 📧 **Geração automática de emails** - Cria emails profissionais de cotação
- 📋 **Cadastro de fornecedores** - Sistema completo de gerenciamento
- 🔄 **Suporte a múltiplos produtos** - Processa listas de produtos automaticamente
- 💾 **Persistência de dados** - MongoDB Atlas para armazenamento permanente
- 🌐 **Interface responsiva** - Funciona em desktop e mobile

## Tecnologias

- **Backend**: Node.js + Express
- **Banco de dados**: MongoDB Atlas
- **IA**: OpenAI GPT-4
- **Frontend**: HTML5 + CSS3 + JavaScript
- **Deploy**: Render.com

## Configuração

### Variáveis de Ambiente

```env
PORT=3000
MONGODB_URI=sua_string_de_conexao_mongodb_atlas
DB_NAME=ipartes_cotacao
COLLECTION_NAME=suppliers
OPENAI_API_KEY=sua_chave_openai
```

### Instalação Local

```bash
npm install
npm start
```

## Deploy no Render.com

1. Conecte este repositório ao Render.com
2. Configure as variáveis de ambiente
3. Deploy automático será realizado

## Uso

1. **Página Principal**: Busca de fornecedores e geração de emails
2. **Cadastro de Fornecedores**: Adicione seus próprios fornecedores
3. **Múltiplos Produtos**: Cole uma lista de produtos para processamento em lote

## Autor

Sistema desenvolvido para IPARTES - Soluções em cotação de equipamentos industriais.

## Versão

2.0.0 - Sistema com persistência MongoDB Atlas e deploy otimizado para Render.com

