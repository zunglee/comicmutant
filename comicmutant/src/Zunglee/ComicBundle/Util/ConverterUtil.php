<?php

namespace Zunglee\ComicBundle\Util;

use Symfony\Component\Serializer\Serializer;
use Symfony\Component\Serializer\Encoder\XmlEncoder;
use Symfony\Component\Serializer\Encoder\JsonEncoder;
use Symfony\Component\Serializer\Normalizer\GetSetMethodNormalizer;

class ConverterUtil
{

    /**
     * @return the object
     * */
    static public function convertJsontoObject($json, $object) {
        $encoders = array(new XmlEncoder(), new JsonEncoder());
        $normalizers = array(new GetSetMethodNormalizer()); 
        $serializer = new Serializer($normalizers, $encoders);
        $jsonContent = $serializer->deserialize($json, $object, 'json');
        return $jsonContent;
    }

    /**
     * @return the json
     * */
    static public function convertObjecttoJson($object) {
        $encoders = array(new XmlEncoder(), new JsonEncoder());
        $normalizers = array(new GetSetMethodNormalizer());
        $serializer = new Serializer($normalizers, $encoders);
        $jsonContent = $serializer->serialize($object, 'json');
        return $jsonContent;
    }

    /**
     * @return the array
     * */
   static public function convertObjecttoArray($object, array $ignoreAttribute = array(),$api = null) {
        $retArray = array();
        $map = ($api ? $object->getApiConverterMap() : $object->getConverterMap());
        $map = array_flip($map);

        foreach ($ignoreAttribute as $val) {
            unset($map[$val]);
        }
        foreach ($map as $val => $dbName) {
            $fun = "get" . ucfirst($val);
            $retArray[$dbName] = $object->$fun();
        }

        return $retArray;
    }

    static public function convertArraytoObject($data, $retObj) {
        $map = $retObj->getConverterMap();
        if (!is_array($data)) {
            return null;
        }
        foreach ($data as $dbName => $val) {
            if (!empty($map[$dbName])) {
                $fun = "set" . ucfirst($map[$dbName]);
                $retObj->$fun($val);
            }
        }
        return $retObj;
    }

    static public function convertStringToBoolean($data, $array) {
      foreach($array as $value){
          $data[$value] = ($data[$value] == 1 ? true:false);         
      }
        return $data;
    }        
}
