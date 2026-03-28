import type { Schema, Struct } from '@strapi/strapi';

export interface SharedContactInfo extends Struct.ComponentSchema {
  collectionName: 'components_shared_contact_infos';
  info: {
    displayName: 'contact_info';
    icon: 'link';
  };
  attributes: {
    address_map_link: Schema.Attribute.String;
    contact_info_email: Schema.Attribute.Email;
    contact_info_phone: Schema.Attribute.String;
  };
}

export interface SharedFaqs extends Struct.ComponentSchema {
  collectionName: 'components_shared_faqs';
  info: {
    displayName: 'faqs';
    icon: 'hashtag';
  };
  attributes: {
    faqs_answer: Schema.Attribute.RichText;
    faqs_question: Schema.Attribute.String;
  };
}

export interface SharedMedia extends Struct.ComponentSchema {
  collectionName: 'components_shared_media';
  info: {
    displayName: 'Media';
    icon: 'file-video';
  };
  attributes: {
    file: Schema.Attribute.Media<'images' | 'files' | 'videos'>;
  };
}

export interface SharedQuote extends Struct.ComponentSchema {
  collectionName: 'components_shared_quotes';
  info: {
    displayName: 'Quote';
    icon: 'indent';
  };
  attributes: {
    body: Schema.Attribute.Text;
    title: Schema.Attribute.String;
  };
}

export interface SharedRichText extends Struct.ComponentSchema {
  collectionName: 'components_shared_rich_texts';
  info: {
    description: '';
    displayName: 'Rich text';
    icon: 'align-justify';
  };
  attributes: {
    body: Schema.Attribute.RichText;
  };
}

export interface SharedSeo extends Struct.ComponentSchema {
  collectionName: 'components_shared_seos';
  info: {
    description: '';
    displayName: 'Seo';
    icon: 'allergies';
    name: 'Seo';
  };
  attributes: {
    metaDescription: Schema.Attribute.Text & Schema.Attribute.Required;
    metaTitle: Schema.Attribute.String & Schema.Attribute.Required;
    shareImage: Schema.Attribute.Media<'images'>;
  };
}

export interface SharedSlider extends Struct.ComponentSchema {
  collectionName: 'components_shared_sliders';
  info: {
    description: '';
    displayName: 'Slider';
    icon: 'address-book';
  };
  attributes: {
    files: Schema.Attribute.Media<'images', true>;
  };
}

export interface SharedSocialMediaLinks extends Struct.ComponentSchema {
  collectionName: 'components_shared_social_media_links';
  info: {
    displayName: 'social_media_links';
    icon: 'link';
  };
  attributes: {
    social_link: Schema.Attribute.String;
    social_platform: Schema.Attribute.Enumeration<
      [
        'Email',
        'Phone#',
        'Website',
        'LinkTree',
        'Facebook',
        'YouTube',
        'WhatsApp',
        'Instagram',
        'WeChat',
        'TikTok',
        'Telegram',
        'Snapchat',
        'X (formerly Twitter)',
        'Pinterest',
        'Reddit',
        'LinkedIn',
        'Discord',
        'Threads',
        'Kuaishou',
        'QQ',
        'Quora',
        'Tumblr',
        'Line',
        'BeReal',
        'Twitch',
        'Viber',
        'VK (VKontakte)',
        'Mastodon',
        'Clubhouse',
      ]
    >;
  };
}

export interface SharedValidDates extends Struct.ComponentSchema {
  collectionName: 'components_shared_valid_dates';
  info: {
    displayName: 'valid_dates';
    icon: 'apps';
  };
  attributes: {
    valid_date: Schema.Attribute.Date;
  };
}

declare module '@strapi/strapi' {
  export module Public {
    export interface ComponentSchemas {
      'shared.contact-info': SharedContactInfo;
      'shared.faqs': SharedFaqs;
      'shared.media': SharedMedia;
      'shared.quote': SharedQuote;
      'shared.rich-text': SharedRichText;
      'shared.seo': SharedSeo;
      'shared.slider': SharedSlider;
      'shared.social-media-links': SharedSocialMediaLinks;
      'shared.valid-dates': SharedValidDates;
    }
  }
}
